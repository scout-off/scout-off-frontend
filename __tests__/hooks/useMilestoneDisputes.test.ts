/**
 * Issue #1066 — hook test coverage suite.
 * Tests for useMilestoneDisputes (hooks/useMilestoneDisputes.ts), which reads a
 * player's milestone dispute records and is consumed by
 * components/player/DisputeMilestoneModal.tsx.
 */
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';

jest.mock('@/lib/api', () => ({
  fetchMilestoneDisputes: jest.fn(),
}));

import { fetchMilestoneDisputes } from '@/lib/api';
import { useMilestoneDisputes } from '@/hooks/useMilestoneDisputes';
import type { MilestoneDispute } from '@/types';

const mockFetch = fetchMilestoneDisputes as jest.Mock;

const DISPUTE: MilestoneDispute = {
  id: 'dispute-1',
  playerId: 'player-1',
  milestoneId: 'milestone-1',
  reason: 'Milestone not delivered',
  status: 'open',
  createdAt: 1_900_000_000,
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
  mockFetch.mockResolvedValue([DISPUTE]);
});

describe('useMilestoneDisputes — happy path', () => {
  it('fetches disputes for the given player ID', async () => {
    const { result } = renderHook(() => useMilestoneDisputes('player-1'), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith('player-1');
    expect(result.current.disputes).toEqual([DISPUTE]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useMilestoneDisputes — loading state', () => {
  it('loading is true while the fetch is in-flight', async () => {
    let resolveFetch: (disputes: MilestoneDispute[]) => void = () => {};
    mockFetch.mockImplementation(
      () =>
        new Promise<MilestoneDispute[]>((resolve) => (resolveFetch = resolve)),
    );

    const { result } = renderHook(() => useMilestoneDisputes('player-1'), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch([DISPUTE]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.disputes).toEqual([DISPUTE]);
  });

  it('does not fetch when playerId is null', async () => {
    const { result } = renderHook(() => useMilestoneDisputes(null), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.disputes).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe('useMilestoneDisputes — error state', () => {
  it('returns the error message when the fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Disputes unavailable'));

    const { result } = renderHook(() => useMilestoneDisputes('player-1'), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.disputes).toEqual([]);
    expect(result.current.error).toBe('Disputes unavailable');
    expect(result.current.loading).toBe(false);
  });
});

describe('useMilestoneDisputes — refetch', () => {
  it('refetch picks up a newly filed dispute', async () => {
    const { result } = renderHook(() => useMilestoneDisputes('player-1'), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.disputes).toEqual([DISPUTE]);

    const NEW_DISPUTE: MilestoneDispute = {
      ...DISPUTE,
      id: 'dispute-2',
      reason: 'Second milestone not delivered',
    };
    mockFetch.mockResolvedValue([DISPUTE, NEW_DISPUTE]);

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.current.disputes).toEqual([DISPUTE, NEW_DISPUTE]);
  });
});
