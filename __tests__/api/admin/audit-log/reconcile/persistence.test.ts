/** @jest-environment node */
jest.mock('@/lib/contract', () => ({
  getValidators: jest.fn(),
  getContractPaused: jest.fn(),
}));
jest.mock('@/lib/indexerClient', () => ({
  fetchEvents: jest.fn(),
}));

import { GET } from '@/app/api/admin/audit-log/reconcile/route';
import { NextRequest } from 'next/server';
import { AdminAuditStore } from '@/lib/adminAuditStore';
import { ReconciliationHistoryStore } from '@/lib/reconciliationHistoryStore';
import { getValidators, getContractPaused } from '@/lib/contract';
import { fetchEvents } from '@/lib/indexerClient';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

// Persistence + alerting behavior added by issue #1188. Kept in a separate
// file from route.test.ts (which drives its requests through a session
// cookie with no matching SessionStore row — a pre-existing gap unrelated
// to this issue) so these new assertions run against a request that
// actually authenticates.

const ADMIN = 'GADMINPERSIST00000000000000000000000000000000000000000';

const mockGetValidators = getValidators as jest.Mock;
const mockGetContractPaused = getContractPaused as jest.Mock;
const mockFetchEvents = fetchEvents as jest.Mock;

function makeAdminRequest(): NextRequest {
  const sid = `sid-${Math.random()}`;
  SessionStore.getInstance().create(sid, ADMIN, Date.now() + 60_000);
  const token = createSessionToken(ADMIN, 'access', 20 * 60, { sid });
  return new NextRequest('http://localhost/api/admin/audit-log/reconcile', {
    headers: { cookie: `session=${token}` },
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  AdminAuditStore.resetInstance();
  AdminAuditStore.getInstance(':memory:');
  ReconciliationHistoryStore.resetInstance();
  SessionStore.resetInstance();
  jest.clearAllMocks();
  mockGetValidators.mockResolvedValue([]);
  mockGetContractPaused.mockResolvedValue(false);
  mockFetchEvents.mockResolvedValue({ events: [], nextCursor: null });
  global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any;
});

afterEach(() => {
  AdminAuditStore.resetInstance();
  ReconciliationHistoryStore.resetInstance();
  SessionStore.resetInstance();
  delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
  delete process.env.RECONCILIATION_WEBHOOK_URL;
});

describe('GET /api/admin/audit-log/reconcile — history persistence & alerting', () => {
  it('persists every run to the history store', async () => {
    await GET(makeAdminRequest());
    await GET(makeAdminRequest());

    const runs = ReconciliationHistoryStore.getInstance().listRuns();
    expect(runs).toHaveLength(2);
  });

  it('does not send a webhook notification when there are no mismatches', async () => {
    process.env.RECONCILIATION_WEBHOOK_URL = 'https://example.com/webhook';
    await GET(makeAdminRequest());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends a webhook notification the first time a mismatch appears', async () => {
    process.env.RECONCILIATION_WEBHOOK_URL = 'https://example.com/webhook';
    mockGetContractPaused.mockResolvedValue(true); // no pause history in the log -> mismatch

    await GET(makeAdminRequest());

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const runs = ReconciliationHistoryStore.getInstance().listRuns();
    expect(runs[0].mismatches.length).toBeGreaterThan(0);
    expect(runs[0].newMismatchCount).toBe(runs[0].mismatches.length);
  });

  it('does not re-notify for a mismatch that persists across consecutive runs', async () => {
    process.env.RECONCILIATION_WEBHOOK_URL = 'https://example.com/webhook';
    mockGetContractPaused.mockResolvedValue(true);

    await GET(makeAdminRequest());
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Same mismatch persists into the second run — no fresh notification.
    await GET(makeAdminRequest());
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const runs = ReconciliationHistoryStore.getInstance().listRuns();
    expect(runs[0].newMismatchCount).toBe(0); // most recent run (index 0, newest-first)
    expect(runs[0].mismatches.length).toBeGreaterThan(0);
  });

  it('notifies again for a genuinely new mismatch even while an old one persists', async () => {
    process.env.RECONCILIATION_WEBHOOK_URL = 'https://example.com/webhook';
    mockGetContractPaused.mockResolvedValue(true);

    await GET(makeAdminRequest());
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // A second, distinct mismatch shows up on top of the still-present pause one.
    mockGetValidators.mockResolvedValue([
      { address: 'GNEWVALIDATOR000000000000000000000000000000000000000000', addedAt: 1, addedBy: 'x' },
    ]);
    await GET(makeAdminRequest());

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const runs = ReconciliationHistoryStore.getInstance().listRuns();
    expect(runs[0].newMismatchCount).toBe(1);
  });
});
