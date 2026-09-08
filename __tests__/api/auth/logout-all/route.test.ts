/** @jest-environment node */
import { POST } from '../../../../app/api/auth/logout-all/route';
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const PUBLIC_KEY = 'GLOGOUTALLKEY00000000000000000000000000000000000000000000';

function makeRequest(cookieHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers['cookie'] = cookieHeader;
  return new NextRequest('http://localhost:3000/api/auth/logout-all', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  SessionStore.resetInstance();
});

afterEach(() => {
  SessionStore.resetInstance();
});

describe('POST /api/auth/logout-all', () => {
  it('returns 401 when there is no session cookie', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("revokes every active session for the wallet, not just the caller's own", async () => {
    const store = SessionStore.getInstance();

    // Two "other device" sessions plus the one making this request.
    store.create('sid-device-a', PUBLIC_KEY, Date.now() + 60_000);
    store.create('sid-device-b', PUBLIC_KEY, Date.now() + 60_000);
    const callerSid = 'sid-caller';
    store.create(callerSid, PUBLIC_KEY, Date.now() + 60_000);

    // A different wallet's session must be left untouched.
    store.create(
      'sid-other-wallet',
      'GSOMEONEELSE000000000000000000000000000000000000000000',
      Date.now() + 60_000,
    );

    const callerToken = createSessionToken(PUBLIC_KEY, 'access', 20 * 60, {
      sid: callerSid,
    });

    const res = await POST(makeRequest(`session=${callerToken}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, revoked: 3 });

    expect(store.isActive('sid-device-a')).toBe(false);
    expect(store.isActive('sid-device-b')).toBe(false);
    expect(store.isActive(callerSid)).toBe(false);
    expect(store.isActive('sid-other-wallet')).toBe(true);

    // The caller's own cookies are cleared in the response too.
    expect(res.cookies.get('session')?.value).toBe('');
    expect(res.cookies.get('session_refresh')?.value).toBe('');
  });
});
