import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  locales,
  defaultLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LIKE_SEGMENT,
  resolveSupportedLocale,
} from '@/lib/locales';
import { negotiateLocale } from '@/lib/negotiateLocale';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { buildCsp } from '@/lib/csp';

function getLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && locales.includes(cookieLocale)) {
    return cookieLocale;
  }

  return negotiateLocale(
    request.headers.get('accept-language'),
    locales,
    defaultLocale,
  );
}

/**
 * Normalise a dynamic Admin API pathname into a stable route template so
 * every distinct value of a dynamic segment (e.g. `[id]`, `[wallet]`) is
 * mapped to the same rate-limit bucket (issue #1494).
 *
 * Without this, a caller that varies the `id` in successive requests such as
 *   /api/admin/academies/1/members/GABC.../
 *   /api/admin/academies/2/members/GDEF.../
 * would get a fresh 30-req/min bucket for every unique pair, effectively
 * multiplying the limit without bound.
 *
 * Replaced patterns (left to right, first match wins per segment):
 *   - Stellar public keys  (G + 55 base32 chars)
 *   - UUIDs                (8-4-4-4-12 hex)
 *   - Numeric IDs          (one or more digits)
 * Everything else is kept verbatim so named static segments such as
 * "reconcile", "lift", "status" remain distinguishable.
 */
function normaliseAdminPath(pathname: string): string {
  // Stellar public keys: 'G' followed by 55 uppercase base32 characters
  const stellarKey = /^G[A-Z2-7]{55}$/;
  // UUID v1–v5
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Pure numeric IDs
  const numericId = /^\d+$/;

  return pathname
    .split('/')
    .map((segment) => {
      if (
        stellarKey.test(segment) ||
        uuid.test(segment) ||
        numericId.test(segment)
      ) {
        return '[id]';
      }
      return segment;
    })
    .join('/');
}

/**
 * Resolve the admin rate-limit policy for a normalised route template.
 *
 * The concrete limit numbers live in the central registry
 * (`lib/rateLimitPolicies.ts`) so admin throttling is no longer bespoke to
 * this file (issue #1665). The `normaliseAdminPath` bucket protection from
 * #1494 is preserved by keying on the normalised template.
 */
function getAdminPolicy(routeTemplate: string) {
  if (routeTemplate === '/api/admin/audit-log/reconcile') {
    return POLICIES.adminReconcile;
  }
  if (routeTemplate === '/api/admin/fraud-flags') {
    return POLICIES.adminFraudEvaluation;
  }
  return POLICIES.adminDefault;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Generate a per-request nonce for CSP. crypto.randomUUID() is available
  // in the Edge runtime used by Next.js middleware.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp({ nonce });

  if (pathname.startsWith('/api/admin/')) {
    // Normalise the pathname so dynamic segments (wallet addresses, UUIDs,
    // numeric IDs) are collapsed to [id] before building the bucket key —
    // preventing callers from bypassing the limit by varying path params
    // (issue #1494).
    const routeTemplate = normaliseAdminPath(pathname);
    const policy = getAdminPolicy(routeTemplate);
    const result = await checkRateLimit(
      `admin-api:${routeTemplate}:${getClientIp(request)}`,
      { limit: policy.limit, windowMs: policy.windowMs },
    );

    if (result.limited) {
      return NextResponse.json(
        {
          type: 'about:blank',
          title: 'Too Many Requests',
          status: 429,
          detail:
            'Admin request rate limit exceeded. Please try again shortly.',
        },
        {
          status: 429,
          headers: {
            'Content-Type': 'application/problem+json',
            'Retry-After': String(result.retryAfterSec ?? 60),
          },
        },
      );
    }
  }

  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );

  // Shared header mutations: stamp the nonce so app/layout.tsx can read it
  // via headers() and apply it to the no-flash theme script.
  //
  // The CSP header MUST also be set on the forwarded request headers (not
  // just the response). Next.js only stamps its own framework/RSC inline
  // scripts (`self.__next_f.push(...)`) with a nonce when it can read one
  // from the request's Content-Security-Policy header. Without this, those
  // scripts are blocked by the very policy the same request sends back
  // (issue #1664).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-pathname', pathname);
  requestHeaders.set('Content-Security-Policy', csp);

  if (pathnameHasLocale) {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }

  const locale = getLocale(request);
  // Clone nextUrl rather than resolving a new path against request.url so
  // the query string (e.g. ?ref= referral codes) survives the redirect.
  const url = request.nextUrl.clone();

  // A first segment that looks like a locale tag but isn't an exact match
  // (/EN/scout, /fr-FR/scout, /de/scout) must be normalised or replaced
  // rather than prefixed — otherwise /de/scout becomes /en/de/scout, a 404
  // (#1687).
  const firstSegment = pathname.split('/')[1] ?? '';
  if (firstSegment && LOCALE_LIKE_SEGMENT.test(firstSegment)) {
    const rest = pathname.slice(firstSegment.length + 1);
    const supported = resolveSupportedLocale(firstSegment);
    if (supported) {
      // Case / region normalisation: /EN/scout, /fr-FR/scout -> /fr/scout
      url.pathname = `/${supported}${rest}`;
      return NextResponse.redirect(url, 301);
    }
    // Unsupported locale-like prefix: replace it with the negotiated locale.
    url.pathname = `/${locale}${rest}`;
    return NextResponse.redirect(url, 307);
  }

  url.pathname = `/${locale}${pathname}`;
  const response = NextResponse.redirect(url);

  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    '/api/admin/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico|icons).*)',
  ],
};
