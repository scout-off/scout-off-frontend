/** @jest-environment node */
import { GET, POST } from '@/app/api/notifications/read/route';
import { NextRequest } from 'next/server';
import { NotificationReadStore } from '@/lib/notificationReadStore';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';

let sidCounter = 0;

// #1179: getSessionWallet also checks lib/sessionStore.ts — register the
// sid alongside the signed token so the cookie resolves to an active row.
function makeRequest(
  url: string,
  init: { method?: string; cookie?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.cookie !== undefined) {
    const sid = `sid-${sidCounter++}`;
    SessionStore.getInstance().create(
      sid,
      init.cookie,
      Date.now() + 60 * 60 * 1000,
    );
    headers['cookie'] =
      `session=${createSessionToken(init.cookie, 'access', 20 * 60, { sid })}`;
  }
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

beforeEach(() => {
  NotificationReadStore.resetInstance();
  SessionStore.resetInstance();
});

afterEach(() => {
  NotificationReadStore.resetInstance();
  SessionStore.resetInstance();
});

describe('GET /api/notifications/read', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await GET(
      makeRequest('http://localhost/api/notifications/read'),
    );
    expect(res.status).toBe(401);
  });

  it('returns an empty list when nothing has been read', async () => {
    const res = await GET(
      makeRequest('http://localhost/api/notifications/read', {
        cookie: SCOUT,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ids: [] });
  });

  it('returns the read ids for the requesting wallet only', async () => {
    NotificationReadStore.getInstance().markRead(SCOUT, [1, 2]);
    NotificationReadStore.getInstance().markRead('GOTHER', [3]);

    const res = await GET(
      makeRequest('http://localhost/api/notifications/read', {
        cookie: SCOUT,
      }),
    );
    const body = await res.json();
    expect(body.ids.sort()).toEqual([1, 2]);
  });

  it('returns 500 when the store throws', async () => {
    jest.spyOn(NotificationReadStore, 'getInstance').mockImplementation(() => {
      throw new Error('db down');
    });

    const res = await GET(
      makeRequest('http://localhost/api/notifications/read', {
        cookie: SCOUT,
      }),
    );
    expect(res.status).toBe(500);

    jest.restoreAllMocks();
  });
});

describe('POST /api/notifications/read', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/notifications/read', {
        method: 'POST',
        body: { ids: [1] },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid JSON body', async () => {
    const sid = `sid-${sidCounter++}`;
    SessionStore.getInstance().create(sid, SCOUT, Date.now() + 60 * 60 * 1000);
    const req = new NextRequest('http://localhost/api/notifications/read', {
      method: 'POST',
      headers: {
        cookie: `session=${createSessionToken(SCOUT, 'access', 20 * 60, { sid })}`,
        'content-type': 'application/json',
      },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when ids is missing', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/notifications/read', {
        method: 'POST',
        cookie: SCOUT,
        body: {},
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when ids is an empty array', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/notifications/read', {
        method: 'POST',
        cookie: SCOUT,
        body: { ids: [] },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when ids contains a non-number', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/notifications/read', {
        method: 'POST',
        cookie: SCOUT,
        body: { ids: [1, 'two'] },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('marks the given ids as read for the requesting wallet', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/notifications/read', {
        method: 'POST',
        cookie: SCOUT,
        body: { ids: [1, 2, 3] },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(
      NotificationReadStore.getInstance().getReadIds(SCOUT).sort(),
    ).toEqual([1, 2, 3]);
  });

  it('returns 500 when the store throws unexpectedly', async () => {
    jest.spyOn(NotificationReadStore, 'getInstance').mockImplementation(() => {
      throw new Error('db down');
    });

    const res = await POST(
      makeRequest('http://localhost/api/notifications/read', {
        method: 'POST',
        cookie: SCOUT,
        body: { ids: [1] },
      }),
    );
    expect(res.status).toBe(500);

    jest.restoreAllMocks();
  });
});
