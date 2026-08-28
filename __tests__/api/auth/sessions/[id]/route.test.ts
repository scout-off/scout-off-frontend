/** @jest-environment node */
import { DELETE } from '../../../../../app/api/auth/sessions/[id]/route';
import { GET as getSessions } from '../../../../../app/api/auth/sessions/route';
import { NextRequest } from 'next/server';
import { createSessionToken, getSessionWallet } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const PUBLIC_KEY = 'GSESSIONREVOKEKEY000000000000000000000000000000000000000';

function makeRequest(cookieHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers['cookie'] = cookieHeader;
  return new NextRequest('http://localhost:3000/api/auth/sessions/x', {
    method: 'DELETE',
    headers,
  });
}

beforeEach(() => {
  SessionStore.resetInstance();
});

afterEach(() => {
  SessionStore.resetInstance();
});

describe('DELETE /api/auth/sessions/:id', () => {
  it('returns 401 when there is no session cookie', async () => {
    const res = await DELETE(makeRequest(), { params: { id: 'sid-x' } });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the target session doesn't belong to the caller", async () => {
    const store = SessionStore.getInstance();
    const callerSid = 'sid-caller';
    store.create(callerSid, PUBLIC_KEY, Date.now() + 60_000);
    store.create(
      'sid-other-wallet',
      'GSOMEONEELSE0000000000000000000000000000000000000000000',
      Date.now() + 60_000,
    );

    const callerToken = createSessionToken(PUBLIC_KEY, 'access', 20 * 60, {
      sid: callerSid,
    });
    const res = await DELETE(makeRequest(`session=${callerToken}`), {
      params: { id: 'sid-other-wallet' },
    });
    expect(res.status).toBe(404);
    expect(store.isActive('sid-other-wallet')).toBe(true);
  });

  it("revokes another one of the caller's own sessions, and its cookie is rejected on its next request", async () => {
    const store = SessionStore.getInstance();
    const callerSid = 'sid-caller';
    const otherDeviceSid = 'sid-other-device';
    store.create(callerSid, PUBLIC_KEY, Date.now() + 60_000);
    store.create(otherDeviceSid, PUBLIC_KEY, Date.now() + 60_000);

    const callerToken = createSessionToken(PUBLIC_KEY, 'access', 20 * 60, {
      sid: callerSid,
    });
    const otherDeviceToken = createSessionToken(PUBLIC_KEY, 'access', 20 * 60, {
      sid: otherDeviceSid,
    });

    // Confirm the other device's session is valid *before* revocation.
    const before = getSessionWallet(
      new NextRequest('http://localhost:3000/x', {
        headers: { cookie: `session=${otherDeviceToken}` },
      }),
    );
    expect(before).toBe(PUBLIC_KEY);

    const res = await DELETE(makeRequest(`session=${callerToken}`), {
      params: { id: otherDeviceSid },
    });
    expect(res.status).toBe(200);
    // Revoking a sibling session doesn't clear the caller's own cookies.
    expect(res.cookies.get('session')).toBeUndefined();

    // The revoked session's own cookie is now rejected on its next request.
    const after = getSessionWallet(
      new NextRequest('http://localhost:3000/x', {
        headers: { cookie: `session=${otherDeviceToken}` },
      }),
    );
    expect(after).toBeNull();
    expect(store.isActive(otherDeviceSid)).toBe(false);
    // The caller's own session is untouched.
    expect(store.isActive(callerSid)).toBe(true);
  });

  it('revoking the current session also clears its own cookies', async () => {
    const store = SessionStore.getInstance();
    const callerSid = 'sid-caller';
    store.create(callerSid, PUBLIC_KEY, Date.now() + 60_000);

    const callerToken = createSessionToken(PUBLIC_KEY, 'access', 20 * 60, {
      sid: callerSid,
    });
    const res = await DELETE(makeRequest(`session=${callerToken}`), {
      params: { id: callerSid },
    });
    expect(res.status).toBe(200);
    expect(res.cookies.get('session')?.value).toBe('');
    expect(store.isActive(callerSid)).toBe(false);
  });

  it('returns 409 when the target session is already revoked', async () => {
    const store = SessionStore.getInstance();
    const callerSid = 'sid-caller';
    store.create(callerSid, PUBLIC_KEY, Date.now() + 60_000);
    store.revoke(callerSid);

    const callerToken = createSessionToken(PUBLIC_KEY, 'access', 20 * 60, {
      sid: 'sid-active-caller',
    });
    store.create('sid-active-caller', PUBLIC_KEY, Date.now() + 60_000);

    const res = await DELETE(makeRequest(`session=${callerToken}`), {
      params: { id: callerSid },
    });
    expect(res.status).toBe(409);
  });

  it('revoking a session removes it from the active-sessions list', async () => {
    const store = SessionStore.getInstance();
    const callerSid = 'sid-caller';
    const otherDeviceSid = 'sid-other-device';
    store.create(callerSid, PUBLIC_KEY, Date.now() + 60_000);
    store.create(otherDeviceSid, PUBLIC_KEY, Date.now() + 60_000);

    const callerToken = createSessionToken(PUBLIC_KEY, 'access', 20 * 60, {
      sid: callerSid,
    });

    await DELETE(makeRequest(`session=${callerToken}`), {
      params: { id: otherDeviceSid },
    });

    const listRes = await getSessions(
      new NextRequest('http://localhost:3000/api/auth/sessions', {
        headers: { cookie: `session=${callerToken}` },
      }),
    );
    const body = await listRes.json();
    expect(body.sessions.map((s: any) => s.id)).toEqual([callerSid]);
  });
});
