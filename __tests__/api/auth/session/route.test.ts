/** @jest-environment node */
import { GET, PUT } from '../../../../app/api/auth/session/route';
import { NextRequest } from 'next/server';

jest.mock('@/lib/sessionStore', () => ({
  getValidSession: jest.fn(),
  renewSession: jest.fn(),
}));

import { getValidSession, renewSession } from '@/lib/sessionStore';
const mockGetValidSession = getValidSession as jest.Mock;
const mockRenewSession = renewSession as jest.Mock;

const SESSION_ID = 'session-abc-123';
const PUBLIC_KEY = 'GPUBLICKEY0000000000000000000000000000000000000000000000';
const CREATED_AT = 1_700_000_000_000;
const TTL_SECONDS = 86400;

function makeRequest(method: string, cookieHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers['cookie'] = cookieHeader;
  return new NextRequest('http://localhost:3000/api/auth/session', {
    method,
    headers,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/auth/session', () => {
  it('returns 401 and authenticated: false when there is no session cookie', async () => {
    const res = await GET(makeRequest('GET'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ authenticated: false });
    expect(mockGetValidSession).not.toHaveBeenCalled();
  });

  it('returns 401 when the session cookie does not resolve to a valid session (expired or revoked)', async () => {
    mockGetValidSession.mockReturnValue(null);

    const res = await GET(makeRequest('GET', `session=${SESSION_ID}`));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ authenticated: false });
    expect(mockGetValidSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it('returns 200 with authenticated: true and the public key for a valid session', async () => {
    const expiresAt = CREATED_AT + TTL_SECONDS * 1000;
    mockGetValidSession.mockReturnValue({
      id: SESSION_ID,
      publicKey: PUBLIC_KEY,
      createdAt: CREATED_AT,
      expiresAt,
      revoked: false,
    });

    const res = await GET(makeRequest('GET', `session=${SESSION_ID}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      authenticated: true,
      publicKey: PUBLIC_KEY,
      expiresAt,
    });
  });
});

describe('PUT /api/auth/session — renewal', () => {
  it('returns 401 and clears the cookie when there is no session to renew', async () => {
    const res = await PUT(makeRequest('PUT'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
    expect(res.cookies.get('session')?.value).toBe('');
    expect(mockRenewSession).not.toHaveBeenCalled();
  });

  it('returns 401 when the session is expired or revoked and cannot be renewed', async () => {
    mockRenewSession.mockReturnValue(null);

    const res = await PUT(makeRequest('PUT', `session=${SESSION_ID}`));

    expect(res.status).toBe(401);
    expect(mockRenewSession).toHaveBeenCalledWith(SESSION_ID);
    expect(res.cookies.get('session')?.value).toBe('');
  });

  it('rotates the session and sets a fresh cookie on success', async () => {
    const newExpiresAt = CREATED_AT + TTL_SECONDS * 1000;
    mockRenewSession.mockReturnValue({
      id: 'session-new-456',
      publicKey: PUBLIC_KEY,
      createdAt: CREATED_AT,
      expiresAt: newExpiresAt,
      revoked: false,
    });

    const res = await PUT(makeRequest('PUT', `session=${SESSION_ID}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      authenticated: true,
      publicKey: PUBLIC_KEY,
      expiresAt: newExpiresAt,
    });

    const cookie = res.cookies.get('session');
    expect(cookie?.value).toBe('session-new-456');
    expect(cookie?.value).not.toBe(SESSION_ID);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('strict');
    expect(cookie?.maxAge).toBe(TTL_SECONDS);
  });
});
