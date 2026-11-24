/** @jest-environment node */
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_TTL_SEC } from '@/lib/session';
import {
  clearSessionCookies,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  SESSION_COOKIE,
  setSessionCookies,
} from '@/lib/sessionCookies';

const ORIGINAL_ENV = process.env.NODE_ENV;

function setNodeEnv(value: string | undefined) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

afterEach(() => setNodeEnv(ORIGINAL_ENV));

function issue() {
  const response = NextResponse.json({});
  setSessionCookies(response, {
    accessToken: 'access',
    refreshToken: 'refresh',
    refreshMaxAge: 3600,
  });
  return response;
}

describe('setSessionCookies', () => {
  it.each([
    ['production', true],
    ['test', false],
  ])(
    'sets both cookies with the expected attributes (NODE_ENV=%s)',
    (env, secure) => {
      setNodeEnv(env);
      const response = issue();

      expect(response.cookies.get(SESSION_COOKIE)).toMatchObject({
        value: 'access',
        httpOnly: true,
        secure,
        sameSite: 'strict',
        path: '/',
        maxAge: ACCESS_TOKEN_TTL_SEC,
      });
      expect(response.cookies.get(REFRESH_COOKIE)).toMatchObject({
        value: 'refresh',
        httpOnly: true,
        secure,
        sameSite: 'strict',
        path: REFRESH_COOKIE_PATH,
        maxAge: 3600,
      });
      expect(REFRESH_COOKIE_PATH).toBe('/api/auth');
    },
  );
});

describe('clearSessionCookies', () => {
  it('expires both cookies on the paths they were set with', () => {
    const response = NextResponse.json({});
    clearSessionCookies(response);

    const header = response.headers.getSetCookie().join('\n');
    expect(header).toMatch(/session=; Path=\/; Expires=Thu, 01 Jan 1970/);
    expect(header).toMatch(
      /session_refresh=; Path=\/api\/auth; Expires=Thu, 01 Jan 1970/,
    );
  });
});
