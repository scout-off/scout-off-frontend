/** @jest-environment node */
import { GET } from '../../../../app/api/auth/sessions/route';
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const PUBLIC_KEY = 'GSESSIONSLISTKEY0000000000000000000000000000000000000000';

function makeRequest(cookieHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers['cookie'] = cookieHeader;
  return new NextRequest('http://localhost:3000/api/auth/sessions', {
    headers,
  });
}

beforeEach(() => {
  SessionStore.resetInstance();
});

afterEach(() => {
  SessionStore.resetInstance();
});

describe('GET /api/auth/sessions', () => {
  it('returns 401 when there is no session cookie', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("lists only the caller's own active sessions, marking the current one", async () => {
    const store = SessionStore.getInstance();
    const callerSid = 'sid-caller';
    store.create(callerSid, PUBLIC_KEY, Date.now() + 60_000, 'Mozilla/5.0 (Macintosh) Chrome/120.0 Safari/537.36');
    store.create('sid-other-device', PUBLIC_KEY, Date.now() + 60_000, 'Mozilla/5.0 (iPhone) CriOS/120.0 Safari/605.1');
    store.create('sid-other-wallet', 'GSOMEONEELSE0000000000000000000000000000000000000000000', Date.now() + 60_000);

    const callerToken = createSessionToken(PUBLIC_KEY, 'access', 20 * 60, {
      sid: callerSid,
    });
    const res = await GET(makeRequest(`session=${callerToken}`));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.sessions).toHaveLength(2);
    const current = body.sessions.find((s: any) => s.id === callerSid);
    const other = body.sessions.find((s: any) => s.id === 'sid-other-device');
    expect(current.isCurrent).toBe(true);
    expect(other.isCurrent).toBe(false);
    expect(current.deviceLabel).toMatch(/Chrome/);
  });

  it('excludes revoked and expired sessions', async () => {
    const store = SessionStore.getInstance();
    const callerSid = 'sid-caller';
    store.create(callerSid, PUBLIC_KEY, Date.now() + 60_000);
    store.create('sid-revoked', PUBLIC_KEY, Date.now() + 60_000);
    store.revoke('sid-revoked');
    store.create('sid-expired', PUBLIC_KEY, Date.now() - 1_000);

    const callerToken = createSessionToken(PUBLIC_KEY, 'access', 20 * 60, {
      sid: callerSid,
    });
    const res = await GET(makeRequest(`session=${callerToken}`));
    const body = await res.json();

    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe(callerSid);
  });
});
