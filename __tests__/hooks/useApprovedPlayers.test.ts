import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import {
  useApprovedPlayers,
  approvedPlayersKey,
} from '@/hooks/useApprovedPlayers';
import type { Player } from '@/types';

const mockFetchValidatorEvents = jest.fn();
const mockFetchPlayerProfile = jest.fn();

jest.mock('@/lib/indexerClient', () => ({
  fetchValidatorEvents: (...args: unknown[]) =>
    mockFetchValidatorEvents(...args),
}));

jest.mock('@/lib/api', () => ({
  fetchPlayerProfile: (...args: unknown[]) => mockFetchPlayerProfile(...args),
}));

const VALIDATOR = 'G'.padEnd(56, 'V');

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

const makePlayer = (id: string): Player =>
  ({
    id,
    wallet: 'G'.padEnd(56, 'X'),
    vitals: {
      name: `Player ${id}`,
      position: 'forward',
      region: 'EU',
      age: 18,
    },
    progressLevel: 0,
    archived: false,
    milestones: [],
    stats: {},
    ipfsHash: '',
  }) as unknown as Player;

describe('approvedPlayersKey', () => {
  it('returns null when no validator address is provided', () => {
    expect(approvedPlayersKey(null)).toBeNull();
  });

  it('returns a namespaced key for a validator address', () => {
    expect(approvedPlayersKey(VALIDATOR)).toBe(`approved-players:${VALIDATOR}`);
  });
});

describe('useApprovedPlayers', () => {
  beforeEach(() => {
    mockFetchValidatorEvents.mockReset();
    mockFetchPlayerProfile.mockReset();
  });

  it('does not fetch and returns an empty list when validatorAddress is null', () => {
    const { result } = renderHook(() => useApprovedPlayers(null), { wrapper });
    expect(result.current.players).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockFetchValidatorEvents).not.toHaveBeenCalled();
  });

  it('returns an empty list when there are no approved-milestone events', async () => {
    mockFetchValidatorEvents.mockResolvedValueOnce({
      events: [],
      nextCursor: null,
    });

    const { result } = renderHook(() => useApprovedPlayers(VALIDATOR), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.players).toEqual([]);
    expect(mockFetchPlayerProfile).not.toHaveBeenCalled();
  });

  it('deduplicates player IDs across events and fetches each profile once', async () => {
    mockFetchValidatorEvents.mockResolvedValueOnce({
      events: [
        {
          id: 1,
          type: 'milestone_approved',
          playerId: 'p1',
          scout: null,
          validator: VALIDATOR,
          ledger: 1,
          timestamp: 1,
          data: {},
        },
        {
          id: 2,
          type: 'milestone_approved',
          playerId: 'p1',
          scout: null,
          validator: VALIDATOR,
          ledger: 2,
          timestamp: 2,
          data: {},
        },
        {
          id: 3,
          type: 'milestone_approved',
          playerId: 'p2',
          scout: null,
          validator: VALIDATOR,
          ledger: 3,
          timestamp: 3,
          data: {},
        },
      ],
      nextCursor: null,
    });
    mockFetchPlayerProfile.mockImplementation((id: string) =>
      Promise.resolve(makePlayer(id)),
    );

    const { result } = renderHook(() => useApprovedPlayers(VALIDATOR), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetchPlayerProfile).toHaveBeenCalledTimes(2);
    expect(result.current.players.map((p) => p.id).sort()).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('filters out events with a null playerId', async () => {
    mockFetchValidatorEvents.mockResolvedValueOnce({
      events: [
        {
          id: 1,
          type: 'milestone_approved',
          playerId: null,
          scout: null,
          validator: VALIDATOR,
          ledger: 1,
          timestamp: 1,
          data: {},
        },
      ],
      nextCursor: null,
    });

    const { result } = renderHook(() => useApprovedPlayers(VALIDATOR), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.players).toEqual([]);
    expect(mockFetchPlayerProfile).not.toHaveBeenCalled();
  });

  it('paginates through multiple pages until nextCursor is null', async () => {
    mockFetchValidatorEvents
      .mockResolvedValueOnce({
        events: [
          {
            id: 1,
            type: 'milestone_approved',
            playerId: 'p1',
            scout: null,
            validator: VALIDATOR,
            ledger: 1,
            timestamp: 1,
            data: {},
          },
        ],
        nextCursor: 100,
      })
      .mockResolvedValueOnce({
        events: [
          {
            id: 2,
            type: 'milestone_approved',
            playerId: 'p2',
            scout: null,
            validator: VALIDATOR,
            ledger: 2,
            timestamp: 2,
            data: {},
          },
        ],
        nextCursor: null,
      });
    mockFetchPlayerProfile.mockImplementation((id: string) =>
      Promise.resolve(makePlayer(id)),
    );

    const { result } = renderHook(() => useApprovedPlayers(VALIDATOR), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetchValidatorEvents).toHaveBeenCalledTimes(2);
    expect(mockFetchValidatorEvents).toHaveBeenNthCalledWith(2, VALIDATOR, {
      type: 'milestone_approved',
      limit: 200,
      before: 100,
    });
    expect(result.current.players.map((p) => p.id).sort()).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('stops paginating once MAX_PAGES is hit even without a null cursor', async () => {
    mockFetchValidatorEvents.mockResolvedValue({
      events: [],
      nextCursor: 1,
    });

    const { result } = renderHook(() => useApprovedPlayers(VALIDATOR), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetchValidatorEvents).toHaveBeenCalledTimes(10);
  });

  it('tolerates individual player profile fetch failures and skips them', async () => {
    mockFetchValidatorEvents.mockResolvedValueOnce({
      events: [
        {
          id: 1,
          type: 'milestone_approved',
          playerId: 'p1',
          scout: null,
          validator: VALIDATOR,
          ledger: 1,
          timestamp: 1,
          data: {},
        },
        {
          id: 2,
          type: 'milestone_approved',
          playerId: 'p2',
          scout: null,
          validator: VALIDATOR,
          ledger: 2,
          timestamp: 2,
          data: {},
        },
      ],
      nextCursor: null,
    });
    mockFetchPlayerProfile.mockImplementation((id: string) =>
      id === 'p1'
        ? Promise.reject(new Error('not found'))
        : Promise.resolve(makePlayer(id)),
    );

    const { result } = renderHook(() => useApprovedPlayers(VALIDATOR), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.players).toHaveLength(1);
    expect(result.current.players[0].id).toBe('p2');
  });

  it('skips a player profile that resolves to a falsy value', async () => {
    mockFetchValidatorEvents.mockResolvedValueOnce({
      events: [
        {
          id: 1,
          type: 'milestone_approved',
          playerId: 'p1',
          scout: null,
          validator: VALIDATOR,
          ledger: 1,
          timestamp: 1,
          data: {},
        },
      ],
      nextCursor: null,
    });
    mockFetchPlayerProfile.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useApprovedPlayers(VALIDATOR), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.players).toEqual([]);
  });

  it('surfaces an error message when the indexer fetch fails', async () => {
    mockFetchValidatorEvents.mockRejectedValue(new Error('indexer down'));

    const { result } = renderHook(() => useApprovedPlayers(VALIDATOR), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('indexer down');
    expect(result.current.players).toEqual([]);
  });

  it('refetch() triggers revalidation when a validator address is set', async () => {
    mockFetchValidatorEvents.mockResolvedValue({
      events: [],
      nextCursor: null,
    });

    const { result } = renderHook(() => useApprovedPlayers(VALIDATOR), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mockFetchValidatorEvents.mock.calls.length;

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() =>
      expect(mockFetchValidatorEvents.mock.calls.length).toBeGreaterThan(
        callsBefore,
      ),
    );
  });

  it('refetch() is a no-op when there is no validator address', () => {
    const { result } = renderHook(() => useApprovedPlayers(null), { wrapper });
    act(() => {
      result.current.refetch();
    });
    expect(mockFetchValidatorEvents).not.toHaveBeenCalled();
  });
});
