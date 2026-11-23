import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useMilestoneHistory } from '@/hooks/useMilestoneHistory';

const mockGetMilestoneHistory = jest.fn();
const mockGetMilestoneHistoryFromIndexer = jest.fn();

jest.mock('@/lib/contract', () => ({
  getMilestoneHistory: (...args: unknown[]) => mockGetMilestoneHistory(...args),
}));

jest.mock('@/lib/indexerClient', () => ({
  getMilestoneHistoryFromIndexer: (...args: unknown[]) =>
    mockGetMilestoneHistoryFromIndexer(...args),
}));

const MILESTONES = [
  {
    id: 'm1',
    description: 'Scored 20 goals',
    evidenceHash: 'Qm123',
    validator: 'GABC',
    timestamp: 1700000000,
  },
];

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

describe('useMilestoneHistory', () => {
  beforeEach(() => {
    mockGetMilestoneHistory.mockClear();
    mockGetMilestoneHistoryFromIndexer.mockClear();
    // Default: indexer unavailable, so existing "falls back to contract"
    // tests below don't each need to opt into this explicitly.
    mockGetMilestoneHistoryFromIndexer.mockRejectedValue(
      new Error('indexer unreachable'),
    );
  });

  it('returns empty array when no playerId is provided', () => {
    const { result } = renderHook(() => useMilestoneHistory(null), { wrapper });
    expect(result.current.milestones).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockGetMilestoneHistory).not.toHaveBeenCalled();
  });

  it('reads from the indexer first and does not fall back when it succeeds', async () => {
    mockGetMilestoneHistoryFromIndexer.mockResolvedValue(MILESTONES);
    const { result } = renderHook(() => useMilestoneHistory('player-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetMilestoneHistoryFromIndexer).toHaveBeenCalledWith('player-1');
    expect(mockGetMilestoneHistory).not.toHaveBeenCalled();
    expect(result.current.milestones).toEqual(MILESTONES);
  });

  it('falls back to the contract call with the correct playerId when the indexer errors', async () => {
    mockGetMilestoneHistory.mockResolvedValue([]);
    renderHook(() => useMilestoneHistory('player-1'), { wrapper });
    await waitFor(() =>
      expect(mockGetMilestoneHistory).toHaveBeenCalledWith('player-1'),
    );
  });

  it('returns the list of milestones from the contract fallback on success', async () => {
    mockGetMilestoneHistory.mockResolvedValue(MILESTONES);
    const { result } = renderHook(() => useMilestoneHistory('player-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.milestones).toEqual(MILESTONES);
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error state when both the indexer and the contract fallback throw', async () => {
    mockGetMilestoneHistory.mockRejectedValue(new Error('contract error'));
    const { result } = renderHook(() => useMilestoneHistory('player-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('contract error');
    expect(result.current.milestones).toEqual([]);
  });

  it('isLoading is true while in flight and false after', async () => {
    let resolve!: (v: unknown[]) => void;
    mockGetMilestoneHistory.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useMilestoneHistory('player-1'), {
      wrapper,
    });
    expect(result.current.isLoading).toBe(true);
    resolve(MILESTONES);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});
