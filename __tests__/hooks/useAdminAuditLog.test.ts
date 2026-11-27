/**
 * Issue #1060 — hook test coverage suite.
 * Tests for useAdminAuditLog (hooks/useAdminAuditLog.ts), which fetches the
 * admin audit log entries and drives the periodic on-chain reconciliation
 * check described in docs/admin-audit-log.md.
 */
import { renderHook, act, waitFor } from '@testing-library/react';

jest.mock('@/lib/adminAuditClient', () => ({
  fetchAuditLog: jest.fn(),
  fetchReconciliation: jest.fn(),
  fetchReconciliationHistory: jest.fn(),
}));

import {
  fetchAuditLog,
  fetchReconciliation,
  fetchReconciliationHistory,
} from '@/lib/adminAuditClient';
import { useAdminAuditLog } from '@/hooks/useAdminAuditLog';
import type {
  AdminAuditEntry,
  ReconciliationResult,
  ReconciliationRun,
} from '@/lib/adminAudit';

const mockFetchAuditLog = fetchAuditLog as jest.Mock;
const mockFetchReconciliation = fetchReconciliation as jest.Mock;
const mockFetchHistory = fetchReconciliationHistory as jest.Mock;

function entry(id: number): AdminAuditEntry {
  return {
    id,
    actionType: 'validator_add',
    adminWallet: 'GADMIN',
    target: `GVALIDATOR${id}`,
    amountStroops: null,
    txHash: null,
    status: 'confirmed',
    timestamp: 1_900_000_000 + id,
    data: {},
  };
}

const RECONCILIATION: ReconciliationResult = {
  checkedAt: 1_900_000_100,
  mismatches: [],
  skipped: [],
};

const HISTORY: ReconciliationRun[] = [
  {
    id: 1,
    checkedAt: 1_900_000_100,
    mismatches: [],
    newMismatchCount: 0,
    skipped: [],
  },
];

beforeEach(() => {
  jest.resetAllMocks();
  mockFetchAuditLog.mockResolvedValue({
    entries: [entry(3), entry(2)],
    nextCursor: 2,
  });
  mockFetchReconciliation.mockResolvedValue(RECONCILIATION);
  mockFetchHistory.mockResolvedValue(HISTORY);
});

describe('useAdminAuditLog — initial load', () => {
  it('populates entries and the pagination cursor', async () => {
    const { result } = renderHook(() => useAdminAuditLog());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchAuditLog).toHaveBeenCalledWith({ limit: 100 });
    expect(result.current.entries.map((e) => e.id)).toEqual([3, 2]);
    expect(result.current.nextCursor).toBe(2);
    expect(result.current.error).toBe(false);
  });

  it('surfaces a fetch failure as an error with its message', async () => {
    mockFetchAuditLog.mockRejectedValue(new Error('Audit log unavailable'));

    const { result } = renderHook(() => useAdminAuditLog());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.errorMessage).toBe('Audit log unavailable');
    expect(result.current.entries).toEqual([]);
  });
});

describe('useAdminAuditLog — pagination and filters', () => {
  it('loadMore appends the next page using the cursor', async () => {
    const { result } = renderHook(() => useAdminAuditLog());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetchAuditLog.mockResolvedValueOnce({
      entries: [entry(1)],
      nextCursor: null,
    });
    act(() => result.current.loadMore());

    await waitFor(() =>
      expect(result.current.entries.map((e) => e.id)).toEqual([3, 2, 1]),
    );
    expect(mockFetchAuditLog).toHaveBeenLastCalledWith({
      limit: 100,
      before: 2,
    });
    expect(result.current.nextCursor).toBeNull();
  });

  it('setFilter reloads with the new filter', async () => {
    const { result } = renderHook(() => useAdminAuditLog());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() =>
      result.current.setFilter({ limit: 100, actionType: 'fee_withdrawal' }),
    );

    await waitFor(() =>
      expect(mockFetchAuditLog).toHaveBeenLastCalledWith({
        limit: 100,
        actionType: 'fee_withdrawal',
      }),
    );
  });
});

describe('useAdminAuditLog — reconciliation', () => {
  it('runs reconciliation on mount and loads its history', async () => {
    const { result } = renderHook(() => useAdminAuditLog());

    await waitFor(() =>
      expect(result.current.reconciliation).toEqual(RECONCILIATION),
    );
    await waitFor(() =>
      expect(result.current.reconciliationHistory).toEqual(HISTORY),
    );
    expect(result.current.reconciling).toBe(false);
  });

  it('keeps the last result when a reconciliation run fails', async () => {
    const { result } = renderHook(() => useAdminAuditLog());
    await waitFor(() =>
      expect(result.current.reconciliation).toEqual(RECONCILIATION),
    );

    mockFetchReconciliation.mockRejectedValueOnce(new Error('rpc down'));
    act(() => result.current.runReconciliation());

    await waitFor(() => expect(result.current.reconciling).toBe(false));
    expect(result.current.reconciliation).toEqual(RECONCILIATION);
  });
});
