import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  locales,
  defaultLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
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

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Generate a per-request nonce for CSP. crypto.randomUUID() is available
  // in the Edge runtime used by Next.js middleware.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp({ nonce });

  if (pathname.startsWith('/api/admin/')) {
    const isReconciliation = pathname === '/api/admin/audit-log/reconcile';
    const isFraudEvaluation = pathname === '/api/admin/fraud-flags';
    const limit = isReconciliation || isFraudEvaluation ? 3 : 30;
    const windowMs = isReconciliation ? 5 * 60 * 1000 : 60 * 1000;
    // Normalise the pathname so dynamic segments (wallet addresses, UUIDs,
    // numeric IDs) are collapsed to [id] before building the bucket key —
    // preventing callers from bypassing the limit by varying path params
    // (issue #1494).
    const routeTemplate = normaliseAdminPath(pathname);
    const result = await checkRateLimit(
      `admin-api:${routeTemplate}:${getClientIp(request)}`,
      { limit, windowMs },
    );

    if (result.limited) {
      return NextResponse.json(
        {
          error: 'Admin request rate limit exceeded. Please try again shortly.',
        },
        {
          status: 429,
          headers: {
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
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-pathname', pathname);

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
