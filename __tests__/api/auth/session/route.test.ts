/** @jest-environment node */
import { GET } from '../../../../app/api/auth/session/route';
import { NextRequest } from 'next/server';
import { _resetRateLimitStoreForTests } from '@/lib/rateLimit';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

// The session route now uses the shared lib/rateLimit. We mock it here so
// rate-limit behavior is independently tested in __tests__/lib/rateLimit.test.ts
// and these tests can focus on session-cookie / response logic without
// depending on the rate-limiter's internal state between runs.
//
// Tests that specifically exercise rate-limit behavior call jest.mocked(...).mockResolvedValueOnce
// to simulate the limiter firing.
jest.mock('@/lib/rateLimit', () => ({
  getClientIp: jest.fn((req: import('next/server').NextRequest) => {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = req.headers.get('x-real-ip');
    if (realIp) return realIp;
    return 'unknown';
  }),
  checkRateLimit: jest.fn().mockResolvedValue({ limited: false }),
  _resetRateLimitStoreForTests: jest.fn(),
}));

import { checkRateLimit } from '@/lib/rateLimit';
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<
  typeof checkRateLimit
>;

function makeRequest(cookieHeader?: string, ip?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers['cookie'] = cookieHeader;
  if (ip) headers['x-forwarded-for'] = ip;
  return new NextRequest('http://localhost:3000/api/auth/session', {
    method: 'GET',
    headers,
  });
}

let sidCounter = 0;

// Builds a `session=<token>` cookie header for an access token whose `sid`
// is also registered in the session store as active — i.e. what a real
// SEP-10 login produces. See #1179: getSessionWallet (which this route now
// delegates to) checks the store in addition to the token's signature, so
// a cookie with no matching store row is correctly treated the same as an
// unsigned one by every test below that expects success.
function accessCookie(publicKey: string, ttlSec = 20 * 60): string {
  const sid = `sid-${sidCounter++}`;
  const token = createSessionToken(publicKey, 'access', ttlSec, { sid });
  SessionStore.getInstance().create(
    sid,
    publicKey,
    Date.now() + 60 * 60 * 1000,
  );
  return `session=${token}`;
}

beforeEach(() => {
  SessionStore.resetInstance();
  _resetRateLimitStoreForTests();
});

afterEach(() => {
  SessionStore.resetInstance();
});

describe('GET /api/auth/session', () => {
  beforeEach(() => {
    mockCheckRateLimit.mockResolvedValue({ limited: false });
  });

  it('returns 401 and authenticated: false when there is no session cookie', async () => {
    const res = await GET(makeRequest(undefined, 'ip-basic-401'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it('returns 200 with authenticated: true and the public key when a valid signed session cookie is present', async () => {
    const publicKey =
      'GPUBLICKEY0000000000000000000000000000000000000000000000';
    const res = await GET(makeRequest(accessCookie(publicKey), 'ip-basic-200'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      authenticated: true,
      publicKey,
    });
  });

  it('returns 401 when the cookie is a hand-crafted, unsigned address rather than a real session token (see #778)', async () => {
    // Adversarial test: pre-#778, the `session` cookie's value WAS the
    // caller's plaintext public key, so this exact request would have
    // authenticated as the attacker-chosen address with no SEP-10 flow at
    // all. Setting the same raw value now must be rejected.
    const forgedAddress =
      'GATTACKERCHOSEN00000000000000000000000000000000000000000';
    const res = await GET(
      makeRequest(`session=${forgedAddress}`, 'ip-forged-cookie'),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it('returns 401 when the session cookie signature has been tampered with', async () => {
    const publicKey =
      'GPUBLICKEY0000000000000000000000000000000000000000000000';
    const token = createSessionToken(publicKey, 'access', 20 * 60);
    const [payloadB64] = token.split('.');
    const tampered = `${payloadB64}.tamperedsignature`;

    const res = await GET(
      makeRequest(`session=${tampered}`, 'ip-tampered-cookie'),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it('returns 401 once the access token has expired', async () => {
    const publicKey =
      'GPUBLICKEY0000000000000000000000000000000000000000000000';
    // Negative TTL: already expired the instant it's created — simulates
    // "a request made after expiry" without needing real clock injection.
    const res = await GET(
      makeRequest(accessCookie(publicKey, -1), 'ip-expired-cookie'),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it('returns 401 when a refresh token is presented as an access token', async () => {
    // Type confusion guard: a `session_refresh` token must never be
    // accepted where an access token is expected.
    const publicKey =
      'GPUBLICKEY0000000000000000000000000000000000000000000000';
    const refreshToken = createSessionToken(publicKey, 'refresh', 60 * 60 * 24);
    const res = await GET(
      makeRequest(`session=${refreshToken}`, 'ip-wrong-type-cookie'),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it('allows requests under the rate limit to proceed normally', async () => {
    // Simulate the rate limiter allowing the request
    mockCheckRateLimit.mockResolvedValue({ limited: false });

    const res = await GET(makeRequest(undefined, 'ip-under-limit'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it('rate limits when the shared limiter reports limited: true', async () => {
    mockCheckRateLimit.mockResolvedValue({ limited: true, retryAfterSec: 5 });

    const res = await GET(makeRequest(undefined, 'ip-rate-limited'));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: 'Too many requests. Please slow down.' });
    expect(res.headers.get('Retry-After')).toBe('5');
  });

  it('uses retryAfterSec from the limiter in the Retry-After header', async () => {
    mockCheckRateLimit.mockResolvedValue({ limited: true, retryAfterSec: 7 });

    const res = await GET(makeRequest(undefined, 'ip-retry'));
    expect(res.headers.get('Retry-After')).toBe('7');
  });

  it('falls back to the window length for Retry-After when retryAfterSec is absent', async () => {
    // retryAfterSec is optional on RateLimitResult; test the fallback path
    mockCheckRateLimit.mockResolvedValue({ limited: true });

    const res = await GET(makeRequest(undefined, 'ip-no-retry'));
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
  });

  it('tracks rate limits per IP independently (via correct key passed to limiter)', async () => {
    // Verify the route passes a namespaced key so different IPs are independent.
    mockCheckRateLimit.mockResolvedValue({ limited: false });

    await GET(makeRequest(undefined, 'ip-A-session'));
    await GET(makeRequest(undefined, 'ip-B-session'));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('ip-A-session'),
      expect.objectContaining({ algorithm: 'sliding' }),
    );
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('ip-B-session'),
      expect.objectContaining({ algorithm: 'sliding' }),
    );
  });

  it('calls checkRateLimit with algorithm: sliding', async () => {
    await GET(makeRequest(undefined, 'ip-algo-check'));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ algorithm: 'sliding' }),
    );
  });
});
