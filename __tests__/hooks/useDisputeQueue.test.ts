import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { MilestoneDispute } from '@/types';

jest.mock('@/lib/disputesClient', () => ({
  fetchDisputeQueue: jest.fn(),
  decideDispute: jest.fn(),
}));

import { decideDispute, fetchDisputeQueue } from '@/lib/disputesClient';
import { disputeQueueKey, useDisputeQueue } from '@/hooks/useDisputeQueue';

const mockFetchDisputeQueue = fetchDisputeQueue as jest.Mock;
const mockDecideDispute = decideDispute as jest.Mock;

// Fresh, unshared SWR cache per test so results are deterministic
// (mirrors __tests__/hooks/useWatchlist.test.ts).
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

const DISPUTE_A: MilestoneDispute = {
  id: 1,
  playerId: 'player-1',
  playerWallet: 'GPLAYER1',
  milestoneId: 'm1',
  milestoneDescription: 'Scored 20 goals',
  reason: 'Evidence was rejected unfairly',
  status: 'pending',
  createdAt: 1700000000000,
  decidedAt: null,
  decidedBy: null,
  resolutionNote: null,
  revokeTxHash: null,
};

const DISPUTE_B: MilestoneDispute = {
  ...DISPUTE_A,
  id: 2,
  playerId: 'player-2',
  milestoneId: 'm2',
};

/** A promise plus externally-callable resolve/reject, for controlling
 * exactly when an in-flight mock call settles. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('disputeQueueKey', () => {
  it('returns the unfiltered key when status is omitted', () => {
    expect(disputeQueueKey()).toBe('disputes:queue:all');
  });

  it('returns a status-scoped key when status is provided', () => {
    expect(disputeQueueKey('pending')).toBe('disputes:queue:pending');
    expect(disputeQueueKey('upheld')).toBe('disputes:queue:upheld');
    expect(disputeQueueKey('reversed')).toBe('disputes:queue:reversed');
  });
});

describe('useDisputeQueue', () => {
  it('defaults disputes to [] and loading to true before data resolves', async () => {
    const { promise, resolve } = deferred<MilestoneDispute[]>();
    mockFetchDisputeQueue.mockReturnValue(promise);

    const { result } = renderHook(() => useDisputeQueue(), { wrapper });

    expect(result.current.disputes).toEqual([]);
    expect(result.current.loading).toBe(true);

    resolve([DISPUTE_A]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.disputes).toEqual([DISPUTE_A]);
  });

  it('keeps loading false during a background revalidation once data has resolved once', async () => {
    mockFetchDisputeQueue.mockResolvedValueOnce([DISPUTE_A]);
    const { result } = renderHook(() => useDisputeQueue(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.disputes).toEqual([DISPUTE_A]);

    // Second fetch (triggered by refetch) never resolves during this test,
    // so the hook is "revalidating" (isValidating: true) but already has
    // data — loading must stay false, unlike the initial-load case above.
    const { promise: revalidatePromise } = deferred<MilestoneDispute[]>();
    mockFetchDisputeQueue.mockReturnValueOnce(revalidatePromise);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(mockFetchDisputeQueue).toHaveBeenCalledTimes(2));
    // Give any pending microtasks a chance to flush; loading should not
    // flip back to true just because a revalidation is in flight.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.disputes).toEqual([DISPUTE_A]);
  });

  it('surfaces error.message when fetchDisputeQueue rejects', async () => {
    mockFetchDisputeQueue.mockRejectedValue(
      new Error('Failed to fetch dispute queue'),
    );
    const { result } = renderHook(() => useDisputeQueue(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to fetch dispute queue');
    expect(result.current.disputes).toEqual([]);
  });

  it('error is null when the fetch succeeds', async () => {
    mockFetchDisputeQueue.mockResolvedValue([DISPUTE_A]);
    const { result } = renderHook(() => useDisputeQueue(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('decide() calls decideDispute with the id and decision', async () => {
    mockFetchDisputeQueue.mockResolvedValue([DISPUTE_A, DISPUTE_B]);
    mockDecideDispute.mockResolvedValue({ ...DISPUTE_A, status: 'upheld' });

    const { result } = renderHook(() => useDisputeQueue(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.decide(1, { status: 'upheld' });
    });

    expect(mockDecideDispute).toHaveBeenCalledWith(1, { status: 'upheld' });
  });

  it('resolves decide() with the updated dispute returned by decideDispute', async () => {
    mockFetchDisputeQueue.mockResolvedValue([DISPUTE_A, DISPUTE_B]);
    const updated = {
      ...DISPUTE_A,
      status: 'upheld' as const,
      decidedAt: 1700000001000,
    };
    mockDecideDispute.mockResolvedValue(updated);

    const { result } = renderHook(() => useDisputeQueue(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: MilestoneDispute | undefined;
    await act(async () => {
      returned = await result.current.decide(1, { status: 'upheld' });
    });

    expect(returned).toEqual(updated);
  });

  // NOTE ON ACTUAL BEHAVIOR (see hooks/useDisputeQueue.ts):
  //
  //   const updated = await decideDispute(id, decision);
  //   mutate((current) => (current ?? []).filter((d) => d.id !== updated.id), false);
  //
  // decideDispute is awaited FIRST, and only on success does the hook call
  // `mutate` to drop the dispute from the cached list. This is NOT a
  // pre-confirmation optimistic update (i.e. the cache is not touched while
  // the PATCH request is still in flight) — it is a post-success local
  // cache sync that skips SWR's revalidation fetch (the `false` argument).
  // The two tests below prove this ordering with a deferred/controllable
  // decideDispute promise, and document that a failed decide() therefore
  // leaves the cached list completely untouched (see the "rejects" test).
  it('does not remove the dispute from the cache until decideDispute resolves', async () => {
    mockFetchDisputeQueue.mockResolvedValue([DISPUTE_A, DISPUTE_B]);
    const { result } = renderHook(() => useDisputeQueue(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.disputes).toEqual([DISPUTE_A, DISPUTE_B]);

    const { promise, resolve } = deferred<MilestoneDispute>();
    mockDecideDispute.mockReturnValue(promise);

    let decidePromise!: Promise<MilestoneDispute>;
    act(() => {
      decidePromise = result.current.decide(1, { status: 'upheld' });
    });

    // decideDispute is still pending: the cache must be unchanged.
    expect(mockDecideDispute).toHaveBeenCalledWith(1, { status: 'upheld' });
    expect(result.current.disputes).toEqual([DISPUTE_A, DISPUTE_B]);

    // Now let the underlying PATCH call resolve.
    const updated = { ...DISPUTE_A, status: 'upheld' as const };
    await act(async () => {
      resolve(updated);
      await decidePromise;
    });

    // Only now is the resolved dispute filtered out of the cached list.
    expect(result.current.disputes).toEqual([DISPUTE_B]);
  });

  it('leaves the cached list untouched when decideDispute rejects (no optimistic removal to roll back)', async () => {
    mockFetchDisputeQueue.mockResolvedValue([DISPUTE_A, DISPUTE_B]);
    const { result } = renderHook(() => useDisputeQueue(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockDecideDispute.mockRejectedValue(new Error('Failed to decide dispute'));

    await act(async () => {
      await expect(
        result.current.decide(1, { status: 'upheld' }),
      ).rejects.toThrow('Failed to decide dispute');
    });

    // Because decideDispute is awaited before `mutate` is ever called, a
    // rejection means `mutate` never runs — the dispute was never
    // optimistically removed in the first place, so there's nothing to
    // roll back and the list still contains both entries.
    expect(result.current.disputes).toEqual([DISPUTE_A, DISPUTE_B]);
  });

  it('refetch() calls the underlying SWR mutate to force revalidation', async () => {
    mockFetchDisputeQueue.mockResolvedValue([DISPUTE_A]);
    const { result } = renderHook(() => useDisputeQueue(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchDisputeQueue).toHaveBeenCalledTimes(1);

    mockFetchDisputeQueue.mockResolvedValueOnce([DISPUTE_A, DISPUTE_B]);
    await act(async () => {
      await result.current.refetch();
    });

    expect(mockFetchDisputeQueue).toHaveBeenCalledTimes(2);
    expect(result.current.disputes).toEqual([DISPUTE_A, DISPUTE_B]);
  });
});
