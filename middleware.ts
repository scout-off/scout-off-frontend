import { NextRequest, NextResponse } from 'next/server';
import {
  locales,
  defaultLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
} from '@/lib/locales';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const LOCALE_LIKE = /^[a-z]{2}(-[a-z]{2,4})?$/i;

function negotiateLocale(request: NextRequest): string {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookie && (locales as readonly string[]).includes(cookie)) {
    return cookie;
  }

  const acceptLanguage = request.headers.get('accept-language') ?? '';
  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isNaN(q) ? 0 : q };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    if ((locales as readonly string[]).includes(base)) {
      return base;
    }
  }

  return defaultLocale;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const pathnameHasLocale = locales.some(
    (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`,
  );

  if (pathnameHasLocale) {
    return NextResponse.next();
  }

  const locale = negotiateLocale(request);
  const url = request.nextUrl.clone();

  const segments = pathname.split('/');
  const firstSegment = segments[1] ?? '';

  if (firstSegment && LOCALE_LIKE.test(firstSegment)) {
    const lower = firstSegment.toLowerCase();
    const base = lower.split('-')[0];
    const rest = pathname.slice(firstSegment.length + 1);

    if ((locales as readonly string[]).includes(lower)) {
      // Case normalisation: /EN/scout -> /en/scout
      url.pathname = `/${lower}${rest}`;
      return NextResponse.redirect(url, 301);
    }

    if ((locales as readonly string[]).includes(base)) {
      // Region tag normalisation: /fr-FR/scout -> /fr/scout
      url.pathname = `/${base}${rest}`;
      return NextResponse.redirect(url, 301);
    }

    // Unsupported locale-like prefix: strip it and use the negotiated locale
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
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
