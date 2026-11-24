/** @jest-environment node */
import { POST } from '@/app/api/admin/fraud-flags/throttles/[id]/lift/route';
import { NextRequest } from 'next/server';
import { FraudThrottleStore } from '@/lib/fraudThrottleStore';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';
const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';

let sidCounter = 0;

function makeRequest(
  throttleId: string,
  init: { cookie?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.cookie !== undefined) {
    // #1179: getSessionWallet also requires an active SessionStore row.
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
  return new NextRequest(
    `http://localhost/api/admin/fraud-flags/throttles/${throttleId}/lift`,
    {
      method: 'POST',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    },
  );
}

function createThrottle() {
  return FraudThrottleStore.getInstance().placeThrottle({
    wallet: SCOUT,
    heuristic: 'test_heuristic',
    category: 'velocity',
    flagId: 'flag-1',
    reason: 'Suspected abuse',
    evidence: { score: 0.9 },
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  FraudThrottleStore.resetInstance();
  SessionStore.resetInstance();
});

afterEach(() => {
  FraudThrottleStore.resetInstance();
  SessionStore.resetInstance();
  delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
});

describe('POST /api/admin/fraud-flags/throttles/:id/lift', () => {
  it('returns 403 without a session cookie', async () => {
    const throttle = createThrottle();
    const res = await POST(makeRequest(String(throttle.id)), {
      params: { id: String(throttle.id) },
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 for a non-admin session', async () => {
    const throttle = createThrottle();
    const res = await POST(
      makeRequest(String(throttle.id), { cookie: SCOUT }),
      { params: { id: String(throttle.id) } },
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for a non-numeric throttle id', async () => {
    const res = await POST(makeRequest('abc', { cookie: ADMIN }), {
      params: { id: 'abc' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown throttle id', async () => {
    const res = await POST(makeRequest('999999', { cookie: ADMIN }), {
      params: { id: '999999' },
    });
    expect(res.status).toBe(404);
  });

  it('lifts a throttle without a reason and returns 200', async () => {
    const throttle = createThrottle();
    const res = await POST(
      makeRequest(String(throttle.id), { cookie: ADMIN }),
      { params: { id: String(throttle.id) } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.liftedAt).toBeTruthy();
    expect(body.liftedBy).toBe(ADMIN);
  });

  it('lifts a throttle with a valid reason and returns 200', async () => {
    const throttle = createThrottle();
    const res = await POST(
      makeRequest(String(throttle.id), {
        cookie: ADMIN,
        body: { reason: 'False positive confirmed' },
      }),
      { params: { id: String(throttle.id) } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.liftReason).toBe('False positive confirmed');
  });

  // issue #1143 — server-side validation parity
  it('returns 400 when reason exceeds 500 characters', async () => {
    const throttle = createThrottle();
    const res = await POST(
      makeRequest(String(throttle.id), {
        cookie: ADMIN,
        body: { reason: 'a'.repeat(501) },
      }),
      { params: { id: String(throttle.id) } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/reason/i);
  });

  it('accepts a reason at exactly 500 characters', async () => {
    const throttle = createThrottle();
    const res = await POST(
      makeRequest(String(throttle.id), {
        cookie: ADMIN,
        body: { reason: 'a'.repeat(500) },
      }),
      { params: { id: String(throttle.id) } },
    );
    expect(res.status).toBe(200);
  });
});
