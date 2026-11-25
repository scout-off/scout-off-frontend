/**
 * Issue #1071 — hook test coverage suite.
 * Tests for useValidatorPendingQueue (hooks/useValidatorPendingQueue.ts), which
 * reads the queue of milestones awaiting a validator's approval.
 */
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';

jest.mock('@/lib/api', () => ({
  fetchValidatorPendingQueue: jest.fn(),
}));

import { fetchValidatorPendingQueue } from '@/lib/api';
import { useValidatorPendingQueue } from '@/hooks/useValidatorPendingQueue';
import type { PendingMilestone } from '@/types';

const mockFetch = fetchValidatorPendingQueue as jest.Mock;

const VALIDATOR_WALLET =
  'GVALIDATORWALLETABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJ';

const MILESTONE_A: PendingMilestone = {
  id: 'milestone-a',
  projectId: 'project-1',
  title: 'Design prototype',
  amount: 500,
  submittedAt: 1_900_000_000,
};

const MILESTONE_B: PendingMilestone = {
  id: 'milestone-b',
  projectId: 'project-2',
  title: 'Ship MVP',
  amount: 1200,
  submittedAt: 1_900_000_500,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  mockFetch.mockResolvedValue([MILESTONE_A, MILESTONE_B]);
});

describe('useValidatorPendingQueue — happy path', () => {
  it('fetches the pending queue for the connected validator wallet', async () => {
    const { result } = renderHook(
      () => useValidatorPendingQueue(VALIDATOR_WALLET),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith(VALIDATOR_WALLET);
    expect(result.current.entries).toEqual([MILESTONE_A, MILESTONE_B]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useValidatorPendingQueue — loading state', () => {
  it('loading is true while the fetch is in-flight', async () => {
    let resolveFetch: (queue: PendingMilestone[]) => void = () => {};
    mockFetch.mockImplementation(
      () =>
        new Promise<PendingMilestone[]>((resolve) => (resolveFetch = resolve)),
    );

    const { result } = renderHook(
      () => useValidatorPendingQueue(VALIDATOR_WALLET),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch([MILESTONE_A]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.entries).toEqual([MILESTONE_A]);
  });

  it('does not fetch when the validator wallet is null', async () => {
    const { result } = renderHook(() => useValidatorPendingQueue(null), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe('useValidatorPendingQueue — empty queue', () => {
  it('returns an empty queue when nothing is pending', async () => {
    mockFetch.mockResolvedValue([]);

    const { result } = renderHook(
      () => useValidatorPendingQueue(VALIDATOR_WALLET),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith(VALIDATOR_WALLET);
    expect(result.current.entries).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useValidatorPendingQueue — error state', () => {
  it('returns the error message when the fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Queue unavailable'));

    const { result } = renderHook(
      () => useValidatorPendingQueue(VALIDATOR_WALLET),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.entries).toEqual([]);
    expect(result.current.error).toBe('Queue unavailable');
    expect(result.current.loading).toBe(false);
  });
});

describe('useValidatorPendingQueue — refetch', () => {
  it('queue shrinks after an item is approved/revoked elsewhere and a refetch fires', async () => {
    const { result } = renderHook(
      () => useValidatorPendingQueue(VALIDATOR_WALLET),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.entries).toEqual([MILESTONE_A, MILESTONE_B]);

    mockFetch.mockResolvedValue([MILESTONE_B]);

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.current.entries).toEqual([MILESTONE_B]);
  });
});
