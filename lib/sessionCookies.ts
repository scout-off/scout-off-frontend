import type { NextResponse } from 'next/server';
import { ACCESS_TOKEN_TTL_SEC } from './session';

/**
 * The one place the `session` / `session_refresh` cookie attributes are
 * defined (#1586). A cookie is only cleared when the delete's `path` matches
 * the path it was set with, so setting and clearing share these constants.
 */
export const SESSION_COOKIE = 'session';
export const REFRESH_COOKIE = 'session_refresh';
export const SESSION_COOKIE_PATH = '/';
// Scoped to /api/auth so it's only ever sent to the refresh/logout
// endpoints, not on every request the way `session` is.
export const REFRESH_COOKIE_PATH = '/api/auth';

export function setSessionCookies(
  response: NextResponse,
  {
    accessToken,
    refreshToken,
    refreshMaxAge,
  }: { accessToken: string; refreshToken: string; refreshMaxAge: number },
): void {
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(SESSION_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: SESSION_COOKIE_PATH,
    maxAge: ACCESS_TOKEN_TTL_SEC,
  });
  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshMaxAge,
  });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.delete({ name: SESSION_COOKIE, path: SESSION_COOKIE_PATH });
  response.cookies.delete({ name: REFRESH_COOKIE, path: REFRESH_COOKIE_PATH });
}
