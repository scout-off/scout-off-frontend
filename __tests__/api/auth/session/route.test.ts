/** @jest-environment node */
import { GET } from '../../../../app/api/auth/session/route';
import { NextRequest } from 'next/server';

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
}));

import { checkRateLimit } from '@/lib/rateLimit';
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

function makeRequest(cookieHeader?: string, ip?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers['cookie'] = cookieHeader;
  if (ip) headers['x-forwarded-for'] = ip;
  return new NextRequest('http://localhost:3000/api/auth/session', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/auth/session', () => {
  beforeEach(() => {
    mockCheckRateLimit.mockResolvedValue({ limited: false });
  });

  it('returns 401 and authenticated: false when there is no session cookie', async () => {
    const res = await GET(makeRequest(undefined, 'ip-basic-401'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it('returns 200 with authenticated: true and the public key when a session cookie is present', async () => {
    const publicKey =
      'GPUBLICKEY0000000000000000000000000000000000000000000000';
    const res = await GET(
      makeRequest(`session=${publicKey}`, 'ip-basic-200'),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      authenticated: true,
      publicKey,
    });
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
