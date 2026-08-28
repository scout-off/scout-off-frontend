import { renderHook, act, waitFor } from '@testing-library/react';
import { useSpendingSummary } from '@/hooks/useSpendingSummary';
import type { IndexedEvent } from '@/lib/indexerClient';

const mockUseWallet = jest.fn();
const mockFetchEvents = jest.fn();

jest.mock('@/hooks/useWallet', () => ({
  useWallet: () => mockUseWallet(),
}));

jest.mock('@/lib/indexerClient', () => ({
  fetchEvents: (...args: unknown[]) => mockFetchEvents(...args),
}));

const SCOUT = 'G'.padEnd(56, '1');
const SCOUT2 = 'G'.padEnd(56, '2');

function makeEvent(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: 1,
    type: 'player_contacted',
    playerId: 'p1',
    scout: SCOUT,
    validator: null,
    ledger: 1,
    timestamp: Math.floor(Date.now() / 1000),
    data: {},
    ...over,
  };
}

function tsMonthsAgo(months: number): number {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - months, 10);
  return Math.floor(d.getTime() / 1000);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useSpendingSummary', () => {
  beforeEach(() => {
    mockUseWallet.mockReset();
    mockFetchEvents.mockReset();
    mockUseWallet.mockReturnValue({ publicKey: null });
  });

  it('does not fetch and stays in the initial loading state when no wallet is connected', () => {
    const { result } = renderHook(() => useSpendingSummary());
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(mockFetchEvents).not.toHaveBeenCalled();
  });

  it('resolves to a zero-filled 12-month breakdown when the wallet has no matching events', async () => {
    mockUseWallet.mockReturnValue({ publicKey: SCOUT });
    mockFetchEvents.mockResolvedValueOnce({ events: [], nextCursor: null });

    const { result } = renderHook(() => useSpendingSummary());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.totalXlm).toBe(0);
    expect(result.current.data?.totalContactFeesXlm).toBe(0);
    expect(result.current.data?.totalSubscriptionsXlm).toBe(0);
    expect(result.current.data?.monthlyBreakdown).toHaveLength(12);
    expect(
      result.current.data?.monthlyBreakdown.every((m) => m.totalXlm === 0),
    ).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('filters events to only this scout and only spending event types', async () => {
    mockUseWallet.mockReturnValue({ publicKey: SCOUT });
    mockFetchEvents.mockResolvedValueOnce({
      events: [
        makeEvent({ id: 1, type: 'player_contacted', scout: SCOUT }),
        makeEvent({ id: 2, type: 'player_contacted', scout: SCOUT2 }), // different scout
        makeEvent({ id: 3, type: 'milestone_approved', scout: SCOUT }), // wrong type
        makeEvent({
          id: 4,
          type: 'scout_subscribed',
          scout: SCOUT,
          data: { tier: 'pro' },
        }),
      ],
      nextCursor: null,
    });

    const { result } = renderHook(() => useSpendingSummary());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.totalContactFeesXlm).toBe(1);
    expect(result.current.data?.totalSubscriptionsXlm).toBe(12);
    expect(result.current.data?.totalXlm).toBe(13);
  });

  it('applies the correct XLM fee per subscription tier and defaults unknown tiers to 5', async () => {
    mockUseWallet.mockReturnValue({ publicKey: SCOUT });
    mockFetchEvents.mockResolvedValueOnce({
      events: [
        makeEvent({
          id: 1,
          type: 'scout_subscribed',
          data: { tier: 'basic' },
        }),
        makeEvent({
          id: 2,
          type: 'scout_subscribed',
          data: { tier: 'elite' },
        }),
        makeEvent({
          id: 3,
          type: 'scout_subscribed',
          data: { tier: 'mystery' },
        }),
        makeEvent({ id: 4, type: 'scout_subscribed', data: {} }),
      ],
      nextCursor: null,
    });

    const { result } = renderHook(() => useSpendingSummary());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // basic(5) + elite(20) + mystery->default(5) + missing tier->basic default(5) = 35
    expect(result.current.data?.totalSubscriptionsXlm).toBe(35);
  });

  it('prioritizes explicit charged amounts in event data over the tier table', async () => {
    mockUseWallet.mockReturnValue({ publicKey: SCOUT });
    mockFetchEvents.mockResolvedValueOnce({
      events: [
        makeEvent({
          id: 1,
          type: 'scout_subscribed',
          data: { tier: 'basic', fee_xlm: 15 }, // Overrides basic (5) with actual charged 15
        }),
        makeEvent({
          id: 2,
          type: 'player_contacted',
          data: { amount_xlm: 3 }, // Overrides default contact fee (1) with 3
        }),
      ],
      nextCursor: null,
    });

    const { result } = renderHook(() => useSpendingSummary());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.totalSubscriptionsXlm).toBe(15);
    expect(result.current.data?.totalContactFeesXlm).toBe(3);
    expect(result.current.data?.totalXlm).toBe(18);
  });

  it('includes current-month spend in both totals and the monthly breakdown', async () => {
    mockUseWallet.mockReturnValue({ publicKey: SCOUT });
    mockFetchEvents.mockResolvedValueOnce({
      events: [
        makeEvent({ id: 1, type: 'player_contacted' }),
        makeEvent({ id: 2, type: 'player_contacted' }),
      ],
      nextCursor: null,
    });

    const { result } = renderHook(() => useSpendingSummary());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.totalContactFeesXlm).toBe(2);
    // monthlyBreakdown is ordered newest-first (current month at index 0).
    const currentMonth = result.current.data?.monthlyBreakdown[0];
    expect(currentMonth?.contactFeeXlm).toBe(2);
    expect(currentMonth?.totalXlm).toBe(2);
  });

  it('counts spend from more than 12 months ago in totals but not in the monthly breakdown', async () => {
    mockUseWallet.mockReturnValue({ publicKey: SCOUT });
    mockFetchEvents.mockResolvedValueOnce({
      events: [
        makeEvent({
          id: 1,
          type: 'player_contacted',
          timestamp: tsMonthsAgo(13),
        }),
      ],
      nextCursor: null,
    });

    const { result } = renderHook(() => useSpendingSummary());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.totalContactFeesXlm).toBe(1);
    expect(
      result.current.data?.monthlyBreakdown.reduce(
        (sum, m) => sum + m.totalXlm,
        0,
      ),
    ).toBe(0);
  });

  it('includes spend from within the trailing 12 months in the breakdown', async () => {
    mockUseWallet.mockReturnValue({ publicKey: SCOUT });
    mockFetchEvents.mockResolvedValueOnce({
      events: [
        makeEvent({
          id: 1,
          type: 'player_contacted',
          timestamp: tsMonthsAgo(2),
        }),
      ],
      nextCursor: null,
    });

    const { result } = renderHook(() => useSpendingSummary());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const total = result.current.data?.monthlyBreakdown.reduce(
      (sum, m) => sum + m.totalXlm,
      0,
    );
    expect(total).toBe(1);
  });

  it('paginates through multiple pages of events', async () => {
    mockUseWallet.mockReturnValue({ publicKey: SCOUT });
    mockFetchEvents
      .mockResolvedValueOnce({
        events: [makeEvent({ id: 1, type: 'player_contacted' })],
        nextCursor: 50,
      })
      .mockResolvedValueOnce({
        events: [makeEvent({ id: 2, type: 'player_contacted' })],
        nextCursor: null,
      });

    const { result } = renderHook(() => useSpendingSummary());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchEvents).toHaveBeenCalledTimes(2);
    expect(mockFetchEvents).toHaveBeenNthCalledWith(1, { limit: 200 });
    expect(mockFetchEvents).toHaveBeenNthCalledWith(2, {
      limit: 200,
      before: 50,
    });
    expect(result.current.data?.totalContactFeesXlm).toBe(2);
  });

  it('stops paginating once an empty batch is returned even with a non-null cursor', async () => {
    mockUseWallet.mockReturnValue({ publicKey: SCOUT });
    mockFetchEvents.mockResolvedValueOnce({ events: [], nextCursor: 5 });

    const { result } = renderHook(() => useSpendingSummary());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchEvents).toHaveBeenCalledTimes(1);
  });

  it('caps pagination at 10 pages', async () => {
    mockUseWallet.mockReturnValue({ publicKey: SCOUT });
    mockFetchEvents.mockResolvedValue({
      events: [makeEvent()],
      nextCursor: 1,
    });

    const { result } = renderHook(() => useSpendingSummary());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchEvents).toHaveBeenCalledTimes(10);
  });

  it('surfaces the error message when the indexer fetch rejects with an Error', async () => {
    mockUseWallet.mockReturnValue({ publicKey: SCOUT });
    mockFetchEvents.mockRejectedValue(new Error('indexer unreachable'));

    const { result } = renderHook(() => useSpendingSummary());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('indexer unreachable');
    // events stays at its initial empty array on error, and loading flips to
    // false, so the memo takes the "no events, not loading" branch and
    // still returns a zero-filled breakdown rather than null.
    expect(result.current.data?.totalXlm).toBe(0);
    expect(result.current.data?.monthlyBreakdown).toHaveLength(12);
  });

  it('falls back to a default error message when the rejection has no message', async () => {
    mockUseWallet.mockReturnValue({ publicKey: SCOUT });
    mockFetchEvents.mockRejectedValue('boom');

    const { result } = renderHook(() => useSpendingSummary());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Failed to load spending data');
  });

  it('discards a stale in-flight fetch when the wallet changes before it resolves', async () => {
    const first = deferred<{ events: IndexedEvent[]; nextCursor: null }>();
    const second = deferred<{ events: IndexedEvent[]; nextCursor: null }>();
    mockFetchEvents
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    mockUseWallet.mockReturnValue({ publicKey: SCOUT });
    const { result, rerender } = renderHook(() => useSpendingSummary());

    mockUseWallet.mockReturnValue({ publicKey: SCOUT2 });
    rerender();

    await act(async () => {
      first.resolve({
        events: [makeEvent({ scout: SCOUT, type: 'player_contacted' })],
        nextCursor: null,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The stale (first) effect's result must not be applied.
    expect(result.current.loading).toBe(true);

    await act(async () => {
      second.resolve({
        events: [
          makeEvent({
            scout: SCOUT2,
            type: 'scout_subscribed',
            data: { tier: 'basic' },
          }),
        ],
        nextCursor: null,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.totalSubscriptionsXlm).toBe(5);
    expect(result.current.data?.totalContactFeesXlm).toBe(0);
  });
});
