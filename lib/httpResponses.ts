import { NextResponse } from 'next/server';

/**
 * JSON response for routes that return per-user or admin data.
 *
 * Sets `Cache-Control: private, no-store` and `Vary: Cookie` so browsers,
 * the PWA service worker and any shared proxy/CDN never cache (or serve
 * across users) a response that depended on the session cookie.
 *
 * Use this instead of `NextResponse.json` in every route that reads
 * `getSessionWallet` / `requireAdminWallet` and every `/api/admin/*` route;
 * `__tests__/lib/httpResponses.test.ts` enforces that. Public cacheable
 * routes (e.g. `/api/media`) keep their own cache headers and don't use it.
 */
export function privateJson<T>(body: T, init?: ResponseInit): NextResponse<T> {
  const res = NextResponse.json(body, init);
  res.headers.set('Cache-Control', 'private, no-store');
  res.headers.append('Vary', 'Cookie');
  return res;
}
