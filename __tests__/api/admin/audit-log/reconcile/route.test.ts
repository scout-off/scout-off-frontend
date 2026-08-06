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
import { getValidators, getContractPaused } from '@/lib/contract';
import { fetchEvents } from '@/lib/indexerClient';

const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';

const mockGetValidators = getValidators as jest.Mock;
const mockGetContractPaused = getContractPaused as jest.Mock;
const mockFetchEvents = fetchEvents as jest.Mock;

function makeRequest(cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers['cookie'] = `session=${cookie}`;
  return new NextRequest('http://localhost/api/admin/audit-log/reconcile', {
    headers,
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  AdminAuditStore.resetInstance();
  AdminAuditStore.getInstance(':memory:');
  jest.clearAllMocks();
  mockGetValidators.mockResolvedValue([]);
  mockGetContractPaused.mockResolvedValue(false);
  mockFetchEvents.mockResolvedValue({ events: [], nextCursor: null });
});

afterEach(() => {
  AdminAuditStore.resetInstance();
  delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
});

describe('GET /api/admin/audit-log/reconcile', () => {
  it('returns 401 without a matching session cookie', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('reports no mismatches when everything lines up', async () => {
    const res = await GET(makeRequest(ADMIN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mismatches).toEqual([]);
  });

  it('flags an on-chain validator with no audit log record (CLI add)', async () => {
    mockGetValidators.mockResolvedValue([{ address: 'GCLIADDED', addedAt: 1 }]);

    const res = await GET(makeRequest(ADMIN));
    const body = await res.json();
    expect(body.mismatches).toContainEqual(
      expect.objectContaining({
        actionType: 'validator_add',
        kind: 'missing_audit_entry',
        target: 'GCLIADDED',
      }),
    );
  });

  it('flags an audit-logged validator add that is not currently on-chain', async () => {
    AdminAuditStore.getInstance().insertEntry({
      actionType: 'validator_add',
      adminWallet: ADMIN,
      target: 'GADDEDBUTMISSING',
      status: 'submitted',
      timestamp: 1,
    });
    mockGetValidators.mockResolvedValue([]);

    const res = await GET(makeRequest(ADMIN));
    const body = await res.json();
    expect(body.mismatches).toContainEqual(
      expect.objectContaining({
        actionType: 'validator_remove',
        kind: 'missing_onchain_effect',
        target: 'GADDEDBUTMISSING',
      }),
    );
  });

  it('does not flag a validator that was added then removed per the log, and is absent on-chain', async () => {
    const store = AdminAuditStore.getInstance();
    store.insertEntry({
      actionType: 'validator_add',
      adminWallet: ADMIN,
      target: 'GTEMP',
      status: 'submitted',
      timestamp: 1,
    });
    store.insertEntry({
      actionType: 'validator_remove',
      adminWallet: ADMIN,
      target: 'GTEMP',
      status: 'submitted',
      timestamp: 2,
    });
    mockGetValidators.mockResolvedValue([]);

    const res = await GET(makeRequest(ADMIN));
    const body = await res.json();
    expect(body.mismatches).toEqual([]);
  });

  it('flags an on-chain paused=true with no pause history in the log (CLI pause)', async () => {
    mockGetContractPaused.mockResolvedValue(true);

    const res = await GET(makeRequest(ADMIN));
    const body = await res.json();
    expect(body.mismatches).toContainEqual(
      expect.objectContaining({
        actionType: 'pause',
        kind: 'missing_audit_entry',
      }),
    );
  });

  it('does not flag an unpaused contract with no pause history', async () => {
    mockGetContractPaused.mockResolvedValue(false);

    const res = await GET(makeRequest(ADMIN));
    const body = await res.json();
    expect(body.mismatches).toEqual([]);
  });

  it('flags when the log says paused but the contract is not paused on-chain', async () => {
    AdminAuditStore.getInstance().insertEntry({
      actionType: 'pause',
      adminWallet: ADMIN,
      status: 'submitted',
      timestamp: 1,
    });
    mockGetContractPaused.mockResolvedValue(false);

    const res = await GET(makeRequest(ADMIN));
    const body = await res.json();
    expect(body.mismatches).toContainEqual(
      expect.objectContaining({
        actionType: 'pause',
        kind: 'missing_onchain_effect',
      }),
    );
  });

  it('does not flag when the log and on-chain pause state agree', async () => {
    AdminAuditStore.getInstance().insertEntry({
      actionType: 'pause',
      adminWallet: ADMIN,
      status: 'submitted',
      timestamp: 1,
    });
    mockGetContractPaused.mockResolvedValue(true);

    const res = await GET(makeRequest(ADMIN));
    const body = await res.json();
    expect(body.mismatches).toEqual([]);
  });

  it('flags an indexed fees_withdrawn event with no matching audit log entry (CLI withdrawal)', async () => {
    mockFetchEvents.mockResolvedValue({
      events: [
        {
          id: 1,
          type: 'fees_withdrawn',
          playerId: null,
          scout: null,
          validator: null,
          ledger: 100,
          timestamp: 1_700_000_000,
          data: { amount_xlm: 5, to: 'GADMIN' },
        },
      ],
      nextCursor: null,
    });

    const res = await GET(makeRequest(ADMIN));
    const body = await res.json();
    expect(body.mismatches).toContainEqual(
      expect.objectContaining({
        actionType: 'fee_withdrawal',
        kind: 'missing_audit_entry',
      }),
    );
  });

  it('matches an audit log fee withdrawal to its indexed event by amount and timestamp', async () => {
    AdminAuditStore.getInstance().insertEntry({
      actionType: 'fee_withdrawal',
      adminWallet: ADMIN,
      amountStroops: 50_000_000,
      status: 'submitted',
      timestamp: 1_700_000_000,
    });
    mockFetchEvents.mockResolvedValue({
      events: [
        {
          id: 1,
          type: 'fees_withdrawn',
          playerId: null,
          scout: null,
          validator: null,
          ledger: 100,
          timestamp: 1_700_000_010,
          data: { amount_xlm: 5, to: 'GADMIN' },
        },
      ],
      nextCursor: null,
    });

    const res = await GET(makeRequest(ADMIN));
    const body = await res.json();
    expect(body.mismatches).toEqual([]);
  });

  it('does not flag a very recent unmatched withdrawal (indexer lag grace period)', async () => {
    AdminAuditStore.getInstance().insertEntry({
      actionType: 'fee_withdrawal',
      adminWallet: ADMIN,
      amountStroops: 50_000_000,
      status: 'submitted',
      timestamp: Math.floor(Date.now() / 1000),
    });

    const res = await GET(makeRequest(ADMIN));
    const body = await res.json();
    expect(body.mismatches).toEqual([]);
  });

  it('skips fee reconciliation gracefully when the indexer is unavailable', async () => {
    mockFetchEvents.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await GET(makeRequest(ADMIN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toEqual(
      expect.arrayContaining([expect.stringContaining('indexer unavailable')]),
    );
  });
});
