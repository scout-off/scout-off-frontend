/**
 * Issue #1071 — hook test coverage suite.
 * Tests for useValidatorPendingQueue (hooks/useValidatorPendingQueue.ts), which
 * reads the queue of milestone submissions awaiting a validator's review.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';

jest.mock('@/lib/api', () => ({
  fetchPendingMilestoneSubmissions: jest.fn(),
}));

import { fetchPendingMilestoneSubmissions } from '@/lib/api';
import {
  pendingQueueKey,
  useValidatorPendingQueue,
} from '@/hooks/useValidatorPendingQueue';
import type { MilestoneSubmission } from '@/types';

const mockFetch = fetchPendingMilestoneSubmissions as jest.Mock;

const VALIDATOR_WALLET =
  'GVALIDATORWALLETABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJ';

function submission(id: string, createdAt: number): MilestoneSubmission {
  return {
    id,
    playerId: `player-${id}`,
    playerName: null,
    description: `Milestone ${id}`,
    evidenceUrl: null,
    validatorWallet: VALIDATOR_WALLET,
    submittedBy: 'GPLAYER',
    status: 'pending',
    createdAt,
    decidedAt: null,
    txHash: null,
  };
}

const MILESTONE_A = submission('milestone-a', 1_900_000_000);
const MILESTONE_B = submission('milestone-b', 1_900_000_500);

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    {
      value: {
        provider: () => new Map(),
        shouldRetryOnError: false,
        dedupingInterval: 0,
      },
    },
    children,
  );
}

function renderQueue(wallet: string | null = VALIDATOR_WALLET) {
  return renderHook(() => useValidatorPendingQueue(wallet), { wrapper });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockFetch.mockResolvedValue([MILESTONE_A, MILESTONE_B]);
});

describe('pendingQueueKey', () => {
  it('is null without a wallet and namespaced by wallet otherwise', () => {
    expect(pendingQueueKey(null)).toBeNull();
    expect(pendingQueueKey(VALIDATOR_WALLET)).toBe(
      `pending-milestone-submissions:${VALIDATOR_WALLET}`,
    );
  });
});

describe('useValidatorPendingQueue — happy path', () => {
  it('fetches the pending queue for the connected validator wallet', async () => {
    const { result } = renderQueue();

    await waitFor(() =>
      expect(result.current.submissions).toEqual([MILESTONE_A, MILESTONE_B]),
    );
    expect(mockFetch).toHaveBeenCalledWith(VALIDATOR_WALLET);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useValidatorPendingQueue — loading state', () => {
  it('loading is true while the fetch is in-flight', async () => {
    let resolveFetch: (queue: MilestoneSubmission[]) => void = () => {};
    mockFetch.mockImplementation(
      () =>
        new Promise<MilestoneSubmission[]>(
          (resolve) => (resolveFetch = resolve),
        ),
    );

    const { result } = renderQueue();

    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => {
      resolveFetch([MILESTONE_A]);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.submissions).toEqual([MILESTONE_A]);
  });

  it('does not fetch when the validator wallet is null', async () => {
    const { result } = renderQueue(null);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.submissions).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe('useValidatorPendingQueue — empty queue', () => {
  it('returns an empty queue when nothing is pending', async () => {
    mockFetch.mockResolvedValue([]);

    const { result } = renderQueue();

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.submissions).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

describe('useValidatorPendingQueue — error state', () => {
  it('returns the error message when the fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Queue unavailable'));

    const { result } = renderQueue();

    await waitFor(() => expect(result.current.error).toBe('Queue unavailable'));
    expect(result.current.submissions).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe('useValidatorPendingQueue — refetch', () => {
  it('queue shrinks after an item is decided elsewhere and a refetch fires', async () => {
    const { result } = renderQueue();

    await waitFor(() =>
      expect(result.current.submissions).toEqual([MILESTONE_A, MILESTONE_B]),
    );

    mockFetch.mockResolvedValue([MILESTONE_B]);
    act(() => result.current.refetch());

    await waitFor(() =>
      expect(result.current.submissions).toEqual([MILESTONE_B]),
    );
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
