/** @jest-environment node */
import { GET } from '../../../../app/api/auth/session/route';
import { NextRequest } from 'next/server';

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
  it('returns 401 and authenticated: false when there is no session cookie', async () => {
    const res = await GET(makeRequest(undefined, 'ip-basic-401'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it('returns 200 with authenticated: true and the public key when a session cookie is present', async () => {
    const publicKey =
      'GPUBLICKEY0000000000000000000000000000000000000000000000';
    const res = await GET(makeRequest(`session=${publicKey}`, 'ip-basic-200'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      authenticated: true,
      publicKey,
    });
  });

  it('allows requests under the rate limit to proceed normally', async () => {
    const ip = 'ip-under-limit';

    let lastRes;
    for (let i = 0; i < 30; i++) {
      lastRes = await GET(makeRequest(undefined, ip));
    }

    expect(lastRes!.status).toBe(401);
    expect(await lastRes!.json()).toEqual({ authenticated: false });
  });

  it('rate limits after exceeding 30 requests from the same IP within the window', async () => {
    const ip = 'ip-rate-limited';

    let lastRes;
    for (let i = 0; i < 31; i++) {
      lastRes = await GET(makeRequest(undefined, ip));
    }

    expect(lastRes!.status).toBe(429);
    const body = await lastRes!.json();
    expect(body).toEqual({ error: 'Too many requests. Please slow down.' });
    expect(lastRes!.headers.get('Retry-After')).toBeTruthy();
  });

  it('tracks rate limits per IP independently', async () => {
    for (let i = 0; i < 30; i++) {
      await GET(makeRequest(undefined, 'ip-A-session'));
    }
    // ip-A-session is now at the limit; a different IP should be unaffected.
    const res = await GET(makeRequest(undefined, 'ip-B-session'));

    expect(res.status).toBe(401);
  });
});
