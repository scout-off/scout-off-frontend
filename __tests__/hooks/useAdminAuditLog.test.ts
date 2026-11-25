/**
 * Issue #1060 — hook test coverage suite.
 * Tests for useAdminAuditLog (hooks/useAdminAuditLog.ts), which fetches the
 * admin audit log entries and drives the periodic on-chain reconciliation
 * check described in docs/admin-audit-log.md.
 */
import { renderHook, act } from '@testing-library/react';

jest.mock('@/lib/adminAuditLogClient', () => ({
  fetchAuditLog: jest.fn(),
  runAuditReconciliation: jest.fn(),
}));

import {
  fetchAuditLog,
  runAuditReconciliation,
} from '@/lib/adminAuditLogClient';
import { useAdminAuditLog } from '@/hooks/useAdminAuditLog';
import type { AuditLogEntry, AuditLogQuery, AuditReconciliation } from '@/types';

const mockFetchAuditLog = fetchAuditLog as jest.Mock;
const mockRunReconciliation = runAuditReconciliation as jest.Mock;

const ENTRY: AuditLogEntry = {
  id: 'audit-1',
  actor: 'GADMINWALLETABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJK',
  action: 'player.approved',
  target: 'player-1',
  timestamp: 1_900_000_000,
  metadata: {},
};

const RECONCILIATION: AuditReconciliation = {
  checkedAt: 1_900_000_100,
  onChainCount: 1,
  offChainCount: 1,
  mismatches: [],
};

beforeEach(() => {
  jest.resetAllMocks();
  mockFetchAuditLog.mockResolvedValue([ENTRY]);
  mockRunReconciliation.mockResolvedValue(RECONCILIATION);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAdminAuditLog — initial load', () => {
  it('populates entries from fetchAuditLog', async () => {
    const { result } = renderHook(() => useAdminAuditLog());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetchAuditLog).toHaveBeenCalledTimes(1);
    expect(result.current.entries).toEqual([ENTRY]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useAdminAuditLog — setFilter', () => {
  it('re-fetches with the new AuditLogQuery', async () => {
    const { result } = renderHook(() => useAdminAuditLog());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetchAuditLog).toHaveBeenCalledTimes(1);

    const query: AuditLogQuery = { action: 'player.approved', limit: 10 };

    await act(async () => {
      result.current.setFilter(query);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetchAuditLog).toHaveBeenCalledTimes(2);
    expect(mockFetchAuditLog).toHaveBeenLastCalledWith(query);
    expect(result.current.filter).toEqual(query);
  });
});

describe('useAdminAuditLog — runReconciliation', () => {
  it('sets reconciling true then populates reconciliation', async () => {
    let resolveReconciliation: (value: AuditReconciliation) => void = () => {};
    mockRunReconciliation.mockImplementation(
      () =>
        new Promise<AuditReconciliation>((resolve) => {
          resolveReconciliation = resolve;
        }),
    );

    const { result } = renderHook(() => useAdminAuditLog());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.reconciling).toBe(false);

    await act(async () => {
      result.current.runReconciliation();
      await Promise.resolve();
    });

    expect(result.current.reconciling).toBe(true);

    await act(async () => {
      resolveReconciliation(RECONCILIATION);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.reconciling).toBe(false);
    expect(result.current.reconciliation).toEqual(RECONCILIATION);
  });
});

describe('useAdminAuditLog — error state', () => {
  it('returns the error message and clears loading when the fetch fails', async () => {
    mockFetchAuditLog.mockRejectedValue(new Error('Audit log unavailable'));

    const { result } = renderHook(() => useAdminAuditLog());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.entries).toEqual([]);
    expect(result.current.error).toBe('Audit log unavailable');
    expect(result.current.loading).toBe(false);
  });
});

describe('useAdminAuditLog — reconciliation interval', () => {
  it('uses fake timers so the 5-minute interval is not exercised as a real timer', async () => {
    jest.useFakeTimers();

    const { result } = renderHook(() => useAdminAuditLog());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRunReconciliation).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRunReconciliation).toHaveBeenCalledTimes(1);
    expect(result.current.reconciliation).toEqual(RECONCILIATION);
  });
});
