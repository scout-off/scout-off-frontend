/** @jest-environment node */
import { GET } from '@/app/api/admin/audit-log/reconcile/history/route';
import { NextRequest } from 'next/server';
import { ReconciliationHistoryStore } from '@/lib/reconciliationHistoryStore';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const ADMIN = 'GADMINHISTORY0000000000000000000000000000000000000000000';

function makeAdminRequest(query = ''): NextRequest {
  const sid = `sid-${Math.random()}`;
  SessionStore.getInstance().create(sid, ADMIN, Date.now() + 60_000);
  const token = createSessionToken(ADMIN, 'access', 20 * 60, { sid });
  return new NextRequest(
    `http://localhost/api/admin/audit-log/reconcile/history${query}`,
    { headers: { cookie: `session=${token}` } },
  );
}

function makeUnauthenticatedRequest(): NextRequest {
  return new NextRequest(
    'http://localhost/api/admin/audit-log/reconcile/history',
  );
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  ReconciliationHistoryStore.resetInstance();
  SessionStore.resetInstance();
});

afterEach(() => {
  ReconciliationHistoryStore.resetInstance();
  SessionStore.resetInstance();
  delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
});

describe('GET /api/admin/audit-log/reconcile/history', () => {
  it('returns 401 without a matching admin session', async () => {
    const res = await GET(makeUnauthenticatedRequest());
    expect(res.status).toBe(401);
  });

  it('returns an empty list when no runs have been recorded', async () => {
    const res = await GET(makeAdminRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runs).toEqual([]);
  });

  it('returns recorded runs newest first', async () => {
    const store = ReconciliationHistoryStore.getInstance();
    store.insertRun({
      checkedAt: 1,
      mismatches: [],
      newMismatchCount: 0,
      skipped: [],
    });
    store.insertRun({
      checkedAt: 2,
      mismatches: [],
      newMismatchCount: 0,
      skipped: [],
    });

    const res = await GET(makeAdminRequest());
    const body = await res.json();
    expect(body.runs.map((r: any) => r.checkedAt)).toEqual([2, 1]);
  });

  it('respects a limit query parameter', async () => {
    const store = ReconciliationHistoryStore.getInstance();
    for (let i = 0; i < 5; i++) {
      store.insertRun({
        checkedAt: i,
        mismatches: [],
        newMismatchCount: 0,
        skipped: [],
      });
    }

    const res = await GET(makeAdminRequest('?limit=2'));
    const body = await res.json();
    expect(body.runs).toHaveLength(2);
  });
});
