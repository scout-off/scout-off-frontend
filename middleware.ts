import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale } from '@/lib/locales';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

function getLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  if (cookieLocale && locales.includes(cookieLocale)) {
    return cookieLocale;
  }

  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) {
    const preferredLocale = acceptLanguage
      .split(',')[0]
      .split('-')[0]
      .toLowerCase();
    if (locales.includes(preferredLocale)) {
      return preferredLocale;
    }
  }

  return defaultLocale;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/api/admin/')) {
    const isReconciliation = pathname === '/api/admin/audit-log/reconcile';
    const isFraudEvaluation = pathname === '/api/admin/fraud-flags';
    const limit = isReconciliation || isFraudEvaluation ? 3 : 30;
    const windowMs = isReconciliation ? 5 * 60 * 1000 : 60 * 1000;
    const result = await checkRateLimit(
      `admin-api:${pathname}:${getClientIp(request)}`,
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

  if (pathnameHasLocale) {
    // Forward the current pathname via a custom request header so the locale
    // layout (app/[locale]/layout.tsx) can construct canonical URLs from it.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-pathname', pathname);
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  const locale = getLocale(request);
  const response = NextResponse.redirect(
    new URL(`/${locale}${pathname}`, request.url),
  );

  response.cookies.set('NEXT_LOCALE', locale);
  return response;
}

export const config = {
  matcher: [
    '/api/admin/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico|icons).*)',
  ],
};
