/** @jest-environment node */
import { PATCH } from '@/app/api/disputes/[id]/decide/route';
import { NextRequest } from 'next/server';
import { MilestoneDisputeStore } from '@/lib/milestoneDisputeStore';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';
const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';

let sidCounter = 0;

// #1179: getSessionWallet also checks lib/sessionStore.ts — register the
// sid alongside the signed token so the cookie resolves to an active row.
function makeRequest(
  init: { cookie?: string; body?: unknown } = {},
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
  return new NextRequest('http://localhost/api/disputes/1/decide', {
    method: 'PATCH',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

function createPendingDispute() {
  return MilestoneDisputeStore.getInstance().create({
    playerId: 'p1',
    playerWallet: SCOUT,
    milestoneId: 'm1',
    milestoneDescription: 'desc',
    reason: 'this is a valid reason',
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  MilestoneDisputeStore.resetInstance();
  SessionStore.resetInstance();
});

afterEach(() => {
  MilestoneDisputeStore.resetInstance();
  SessionStore.resetInstance();
  delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
});

describe('PATCH /api/disputes/:id/decide', () => {
  it('returns 403 without a matching admin session cookie', async () => {
    const dispute = createPendingDispute();
    const res = await PATCH(
      makeRequest({ cookie: SCOUT, body: { status: 'upheld' } }),
      { params: { id: String(dispute.id) } },
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 with no session cookie at all', async () => {
    const dispute = createPendingDispute();
    const res = await PATCH(makeRequest({ body: { status: 'upheld' } }), {
      params: { id: String(dispute.id) },
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 for a non-numeric id', async () => {
    const res = await PATCH(
      makeRequest({ cookie: ADMIN, body: { status: 'upheld' } }),
      { params: { id: 'abc' } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid JSON body', async () => {
    const dispute = createPendingDispute();
    const sid = `sid-${sidCounter++}`;
    SessionStore.getInstance().create(sid, ADMIN, Date.now() + 60 * 60 * 1000);
    const req = new NextRequest('http://localhost/api/disputes/1/decide', {
      method: 'PATCH',
      headers: {
        cookie: `session=${createSessionToken(ADMIN, 'access', 20 * 60, { sid })}`,
        'content-type': 'application/json',
      },
      body: 'not json',
    });
    const res = await PATCH(req, { params: { id: String(dispute.id) } });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid status value', async () => {
    const dispute = createPendingDispute();
    const res = await PATCH(
      makeRequest({ cookie: ADMIN, body: { status: 'denied' } }),
      { params: { id: String(dispute.id) } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when reversing without a revokeTxHash', async () => {
    const dispute = createPendingDispute();
    const res = await PATCH(
      makeRequest({ cookie: ADMIN, body: { status: 'reversed' } }),
      { params: { id: String(dispute.id) } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown dispute id', async () => {
    const res = await PATCH(
      makeRequest({ cookie: ADMIN, body: { status: 'upheld' } }),
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when the dispute has already been decided', async () => {
    const dispute = createPendingDispute();
    MilestoneDisputeStore.getInstance().decide(dispute.id, {
      status: 'upheld',
      decidedBy: ADMIN,
      resolutionNote: null,
      revokeTxHash: null,
    });

    const res = await PATCH(
      makeRequest({ cookie: ADMIN, body: { status: 'upheld' } }),
      { params: { id: String(dispute.id) } },
    );
    expect(res.status).toBe(409);
  });

  it('upholds a pending dispute and records the admin as decidedBy', async () => {
    const dispute = createPendingDispute();
    const res = await PATCH(
      makeRequest({
        cookie: ADMIN,
        body: { status: 'upheld', resolutionNote: 'Looks legit' },
      }),
      { params: { id: String(dispute.id) } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: dispute.id,
      status: 'upheld',
      decidedBy: ADMIN,
      resolutionNote: 'Looks legit',
    });
  });

  it('reverses a pending dispute when a revokeTxHash is provided', async () => {
    const dispute = createPendingDispute();
    const res = await PATCH(
      makeRequest({
        cookie: ADMIN,
        body: { status: 'reversed', revokeTxHash: '0xabc123' },
      }),
      { params: { id: String(dispute.id) } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: 'reversed',
      revokeTxHash: '0xabc123',
    });
  });

  it('returns 500 when the store throws unexpectedly during decide', async () => {
    const dispute = createPendingDispute();
    jest
      .spyOn(MilestoneDisputeStore.prototype, 'decide')
      .mockImplementation(() => {
        throw new Error('db down');
      });

    const res = await PATCH(
      makeRequest({ cookie: ADMIN, body: { status: 'upheld' } }),
      { params: { id: String(dispute.id) } },
    );
    expect(res.status).toBe(500);

    jest.restoreAllMocks();
  });
});

describe('PATCH /api/disputes/:id/decide — server-side inputValidation parity (issue #1143)', () => {
  it('returns 400 when resolutionNote exceeds 2000 characters', async () => {
    const dispute = createPendingDispute();
    const res = await PATCH(
      makeRequest({
        cookie: ADMIN,
        body: { status: 'upheld', resolutionNote: 'a'.repeat(2001) },
      }),
      { params: { id: String(dispute.id) } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/resolutionNote/i);
  });

  it('accepts a resolutionNote at exactly 2000 characters', async () => {
    const dispute = createPendingDispute();
    const res = await PATCH(
      makeRequest({
        cookie: ADMIN,
        body: { status: 'upheld', resolutionNote: 'a'.repeat(2000) },
      }),
      { params: { id: String(dispute.id) } },
    );
    expect(res.status).toBe(200);
  });
});
