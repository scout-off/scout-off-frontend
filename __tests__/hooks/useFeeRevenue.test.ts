import { renderHook } from '@testing-library/react';
import { useFeeRevenue } from '@/hooks/useFeeRevenue';
import { useIndexerEventCache } from '@/hooks/useIndexerEventCache';
import type { IndexedEvent } from '@/lib/indexerClient';

jest.mock('@/hooks/useIndexerEventCache', () => ({
  useIndexerEventCache: jest.fn(),
  INDEXER_CACHE_KEY: 'indexer:events:shared',
}));

const mockUseIndexerEventCache = useIndexerEventCache as jest.MockedFunction<
  typeof useIndexerEventCache
>;

function makeEvent(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: 1,
    type: 'player_contacted',
    playerId: 'p1',
    scout: 'SCOUT1',
    validator: null,
    ledger: 1,
    timestamp: 1700000000, // 2023-11-14T22:13:20.000Z
    data: {},
    ...over,
  };
}

describe('useFeeRevenue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns loading state when cache is loading', () => {
    mockUseIndexerEventCache.mockReturnValue({
      events: [],
      loading: true,
      error: null,
    });

    const { result } = renderHook(() => useFeeRevenue());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('returns error state when cache has error', () => {
    mockUseIndexerEventCache.mockReturnValue({
      events: [],
      loading: false,
      error: 'Network error',
    });

    const { result } = renderHook(() => useFeeRevenue());
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Network error');
  });

  it('aggregates daily contact fees and subscription fees based on canonical fee schedule', () => {
    // 1700000000 -> 2023-11-14
    mockUseIndexerEventCache.mockReturnValue({
      events: [
        makeEvent({ id: 1, type: 'player_contacted', timestamp: 1700000000 }),
        makeEvent({ id: 2, type: 'player_contacted', timestamp: 1700000000 }),
        makeEvent({
          id: 3,
          type: 'scout_subscribed',
          timestamp: 1700000000,
          data: { tier: 'basic' },
        }),
        makeEvent({
          id: 4,
          type: 'scout_subscribed',
          timestamp: 1700000000,
          data: { tier: 'pro' },
        }),
      ],
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => useFeeRevenue());
    expect(result.current.loading).toBe(false);
    expect(result.current.data?.daily).toHaveLength(1);
    expect(result.current.data?.daily[0]).toEqual({
      date: '2023-11-14',
      contactFeeXlm: 2, // 1 + 1
      subscriptionXlm: 17, // 5 + 12
      totalXlm: 19,
    });
  });

  it('prioritizes explicit fee amounts in event data (dynamic charged amounts)', () => {
    mockUseIndexerEventCache.mockReturnValue({
      events: [
        makeEvent({
          id: 1,
          type: 'player_contacted',
          timestamp: 1700000000,
          data: { fee_xlm: 3 },
        }),
        makeEvent({
          id: 2,
          type: 'scout_subscribed',
          timestamp: 1700000000,
          data: { tier: 'basic', fee_xlm: 15 }, // Overrides basic default 5 with 15
        }),
      ],
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => useFeeRevenue());
    expect(result.current.data?.daily[0]).toEqual({
      date: '2023-11-14',
      contactFeeXlm: 3,
      subscriptionXlm: 15,
      totalXlm: 18,
    });
  });
});
