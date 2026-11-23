import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { usePlatformAnalytics } from '@/hooks/usePlatformAnalytics';
import type { IndexedEvent } from '@/lib/indexerClient';

const mockFetchEvents = jest.fn();

jest.mock('@/lib/indexerClient', () => ({
  fetchEvents: (...args: unknown[]) => mockFetchEvents(...args),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

function makeEvent(over: Partial<IndexedEvent>): IndexedEvent {
  return {
    id: 1,
    type: 'player_registered',
    playerId: null,
    scout: null,
    validator: null,
    ledger: 1,
    timestamp: Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000),
    data: {},
    ...over,
  };
}

/**
 * fetchPlatformAnalytics fires 4 fetchAllEventsOfType calls in parallel
 * (player_registered, scout_subscribed, player_contacted, milestone_approved),
 * each of which pages until nextCursor === null. This resolves each type to a
 * single page (nextCursor: null) based on the `type` query param.
 */
function mockEventsByType(
  eventsByType: Partial<Record<string, IndexedEvent[]>>,
) {
  mockFetchEvents.mockImplementation(({ type }: { type: string }) =>
    Promise.resolve({
      events: eventsByType[type] ?? [],
      nextCursor: null,
    }),
  );
}

describe('usePlatformAnalytics', () => {
  beforeEach(() => {
    mockFetchEvents.mockReset();
  });

  it('starts with null data and loading true, then resolves to empty series', async () => {
    mockEventsByType({});

    const { result } = renderHook(() => usePlatformAnalytics(), { wrapper });

    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({
      playersCumulative: [],
      scoutsCumulative: [],
      milestonesPerWeek: [],
    });
    expect(result.current.error).toBeNull();
  });

  it('builds a cumulative players series keyed by first-seen day', async () => {
    mockEventsByType({
      player_registered: [
        makeEvent({
          id: 1,
          type: 'player_registered',
          playerId: 'p1',
          timestamp: Math.floor(
            new Date('2026-01-01T00:00:00Z').getTime() / 1000,
          ),
        }),
        makeEvent({
          id: 2,
          type: 'player_registered',
          playerId: 'p2',
          timestamp: Math.floor(
            new Date('2026-01-01T12:00:00Z').getTime() / 1000,
          ),
        }),
        makeEvent({
          id: 3,
          type: 'player_registered',
          playerId: 'p3',
          timestamp: Math.floor(
            new Date('2026-01-02T00:00:00Z').getTime() / 1000,
          ),
        }),
      ],
    });

    const { result } = renderHook(() => usePlatformAnalytics(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.playersCumulative).toEqual([
      { date: '2026-01-01', count: 2 },
      { date: '2026-01-02', count: 3 },
    ]);
  });

  it('deduplicates a player to their earliest registration day', async () => {
    mockEventsByType({
      player_registered: [
        makeEvent({
          id: 1,
          type: 'player_registered',
          playerId: 'p1',
          timestamp: Math.floor(
            new Date('2026-01-05T00:00:00Z').getTime() / 1000,
          ),
        }),
        makeEvent({
          id: 2,
          type: 'player_registered',
          playerId: 'p1',
          timestamp: Math.floor(
            new Date('2026-01-01T00:00:00Z').getTime() / 1000,
          ),
        }),
      ],
    });

    const { result } = renderHook(() => usePlatformAnalytics(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.playersCumulative).toEqual([
      { date: '2026-01-01', count: 1 },
    ]);
  });

  it('ignores events with a null identity when building cumulative series', async () => {
    mockEventsByType({
      player_registered: [
        makeEvent({ id: 1, type: 'player_registered', playerId: null }),
      ],
    });

    const { result } = renderHook(() => usePlatformAnalytics(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.playersCumulative).toEqual([]);
  });

  it('builds scoutsCumulative from both scout_subscribed and player_contacted events', async () => {
    mockEventsByType({
      scout_subscribed: [
        makeEvent({
          id: 1,
          type: 'scout_subscribed',
          scout: 'GSCOUT1',
          timestamp: Math.floor(
            new Date('2026-01-01T00:00:00Z').getTime() / 1000,
          ),
        }),
      ],
      player_contacted: [
        makeEvent({
          id: 2,
          type: 'player_contacted',
          scout: 'GSCOUT2',
          timestamp: Math.floor(
            new Date('2026-01-02T00:00:00Z').getTime() / 1000,
          ),
        }),
      ],
    });

    const { result } = renderHook(() => usePlatformAnalytics(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.scoutsCumulative).toEqual([
      { date: '2026-01-01', count: 1 },
      { date: '2026-01-02', count: 2 },
    ]);
  });

  it('buckets approved milestones per ISO (Monday-start) week', async () => {
    mockEventsByType({
      milestone_approved: [
        // Wednesday, Jan 7 2026 -> week of Monday Jan 5
        makeEvent({
          id: 1,
          type: 'milestone_approved',
          timestamp: Math.floor(
            new Date('2026-01-07T00:00:00Z').getTime() / 1000,
          ),
        }),
        // Sunday, Jan 11 2026 -> still week of Monday Jan 5 (diffToMonday=6)
        makeEvent({
          id: 2,
          type: 'milestone_approved',
          timestamp: Math.floor(
            new Date('2026-01-11T00:00:00Z').getTime() / 1000,
          ),
        }),
        // Monday, Jan 12 2026 -> new week
        makeEvent({
          id: 3,
          type: 'milestone_approved',
          timestamp: Math.floor(
            new Date('2026-01-12T00:00:00Z').getTime() / 1000,
          ),
        }),
      ],
    });

    const { result } = renderHook(() => usePlatformAnalytics(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.milestonesPerWeek).toEqual([
      { weekStart: '2026-01-05', count: 2 },
      { weekStart: '2026-01-12', count: 1 },
    ]);
  });

  it('paginates fetchAllEventsOfType across multiple pages per event type', async () => {
    mockFetchEvents.mockImplementation(
      ({ type, before }: { type: string; before?: number }) => {
        if (type !== 'player_registered') {
          return Promise.resolve({ events: [], nextCursor: null });
        }
        if (before === undefined) {
          return Promise.resolve({
            events: [
              makeEvent({ id: 1, type: 'player_registered', playerId: 'p1' }),
            ],
            nextCursor: 50,
          });
        }
        return Promise.resolve({
          events: [
            makeEvent({ id: 2, type: 'player_registered', playerId: 'p2' }),
          ],
          nextCursor: null,
        });
      },
    );

    const { result } = renderHook(() => usePlatformAnalytics(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const playerCalls = mockFetchEvents.mock.calls.filter(
      ([params]) => params.type === 'player_registered',
    );
    expect(playerCalls).toHaveLength(2);
    expect(result.current.data?.playersCumulative).toEqual([
      { date: '2026-01-01', count: 2 },
    ]);
  });

  it('stops paginating a single event type once an empty page is returned', async () => {
    mockFetchEvents.mockImplementation(({ type }: { type: string }) => {
      if (type !== 'player_registered') {
        return Promise.resolve({ events: [], nextCursor: null });
      }
      return Promise.resolve({ events: [], nextCursor: 999 });
    });

    const { result } = renderHook(() => usePlatformAnalytics(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const playerCalls = mockFetchEvents.mock.calls.filter(
      ([params]) => params.type === 'player_registered',
    );
    expect(playerCalls).toHaveLength(1);
  });

  it('surfaces an error message when the indexer fetch fails', async () => {
    mockFetchEvents.mockRejectedValue(new Error('indexer unavailable'));

    const { result } = renderHook(() => usePlatformAnalytics(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('indexer unavailable');
    expect(result.current.data).toBeNull();
  });

  it('refetch() triggers revalidation', async () => {
    mockEventsByType({});

    const { result } = renderHook(() => usePlatformAnalytics(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = mockFetchEvents.mock.calls.length;

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() =>
      expect(mockFetchEvents.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });
});
