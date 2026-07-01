/** @jest-environment node */
import { GET } from '../../../../app/api/auth/session/route';
import { NextRequest } from 'next/server';

function makeRequest(cookieHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers['cookie'] = cookieHeader;
  return new NextRequest('http://localhost:3000/api/auth/session', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/auth/session', () => {
  it('returns 401 and authenticated: false when there is no session cookie', async () => {
    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it('returns 200 with authenticated: true and the public key when a session cookie is present', async () => {
    const publicKey =
      'GPUBLICKEY0000000000000000000000000000000000000000000000';
    const res = await GET(makeRequest(`session=${publicKey}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      authenticated: true,
      publicKey,
    });
  });
});
