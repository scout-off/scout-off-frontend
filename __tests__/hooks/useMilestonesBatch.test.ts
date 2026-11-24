import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import {
  useMilestonesBatch,
  milestonesBatchKey,
} from '@/hooks/useMilestonesBatch';

const mockGetMilestoneHistoryBatch = jest.fn();

jest.mock('@/lib/contract', () => ({
  getMilestoneHistoryBatch: (...args: unknown[]) =>
    mockGetMilestoneHistoryBatch(...args),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

describe('milestonesBatchKey', () => {
  it('returns null for an empty ID list', () => {
    expect(milestonesBatchKey([])).toBeNull();
  });

  it('is order-independent — same set of IDs produces the same key', () => {
    expect(milestonesBatchKey(['p2', 'p1'])).toBe(
      milestonesBatchKey(['p1', 'p2']),
    );
  });

  it('de-duplicates repeated IDs', () => {
    expect(milestonesBatchKey(['p1', 'p1', 'p2'])).toBe(
      milestonesBatchKey(['p1', 'p2']),
    );
  });
});

describe('useMilestonesBatch', () => {
  beforeEach(() => {
    mockGetMilestoneHistoryBatch.mockClear();
  });

  it('does not call getMilestoneHistoryBatch for an empty player ID list', () => {
    const { result } = renderHook(() => useMilestonesBatch([]), { wrapper });
    expect(result.current.milestonesById).toEqual({});
    expect(mockGetMilestoneHistoryBatch).not.toHaveBeenCalled();
  });

  it('fetches milestone data for a whole batch of players in a single call', async () => {
    mockGetMilestoneHistoryBatch.mockResolvedValue({
      p1: [{ id: 'm1' }],
      p2: [],
    });

    const { result } = renderHook(() => useMilestonesBatch(['p1', 'p2']), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetMilestoneHistoryBatch).toHaveBeenCalledTimes(1);
    expect(result.current.milestonesById.p1).toEqual([{ id: 'm1' }]);
    expect(result.current.milestonesById.p2).toEqual([]);
  });

  it('re-renders with the same ID set (e.g. virtualization mounting new cards) do not trigger extra fetches', async () => {
    mockGetMilestoneHistoryBatch.mockResolvedValue({ p1: [], p2: [] });

    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useMilestonesBatch(ids),
      { wrapper, initialProps: { ids: ['p1', 'p2'] } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetMilestoneHistoryBatch).toHaveBeenCalledTimes(1);

    // Same set of IDs, new array reference — simulates a re-render caused
    // by scroll-driven mount/unmount of PlayerCards within an unchanged
    // result set.
    rerender({ ids: ['p1', 'p2'] });

    expect(mockGetMilestoneHistoryBatch).toHaveBeenCalledTimes(1);
  });

  it('fetches again when the ID set actually changes (new search results)', async () => {
    mockGetMilestoneHistoryBatch.mockResolvedValue({ p1: [] });

    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useMilestonesBatch(ids),
      { wrapper, initialProps: { ids: ['p1'] } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetMilestoneHistoryBatch).toHaveBeenCalledTimes(1);

    mockGetMilestoneHistoryBatch.mockResolvedValue({ p3: [] });
    rerender({ ids: ['p3'] });

    await waitFor(() =>
      expect(mockGetMilestoneHistoryBatch).toHaveBeenCalledTimes(2),
    );
  });
});
