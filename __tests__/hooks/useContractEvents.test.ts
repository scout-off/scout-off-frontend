/**
 * Tests for hooks/useContractEvents.ts
 *
 * Covers all four acceptance criteria from the issue:
 *
 *  AC-1  New operation appended server-side between polls appears in state.
 *  AC-2  Burst > page size (20) between polls: no events are silently dropped.
 *  AC-3  No duplicate entries across polls that both return an already-seen op.
 *  AC-4  Both fallback trigger paths (no EventSource, SSE error events
 *        exceeding MAX_RECONNECT_ATTEMPTS) start polling and correctly advance
 *        afterward — not just fetchOperations/cursor logic in isolation.
 *
 * Plus the pre-existing behavioural cases that the original test suite covered,
 * updated to reflect the corrected cursor direction.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useContractEvents,
  fetchOperations,
  MAX_RECONNECT_ATTEMPTS,
  BASE_RECONNECT_DELAY_MS,
  MAX_PAGES_PER_POLL,
} from '@/hooks/useContractEvents';

// ─── helpers ────────────────────────────────────────────────────────────────

const CONTRACT =
  'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678';

/** Build a minimal Horizon operation record. */
function makeOp(id: string, fnHint = '') {
  return {
    id,
    paging_token: id,
    type: 'invoke_host_function',
    function: fnHint,
    created_at: new Date(Number(id) * 1000).toISOString(),
    transaction_hash: 'txhash_' + id,
  };
}

/** Wire up global.fetch to return a fixed list of records once. */
function mockFetch(records: object[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ _embedded: { records } }),
  } as Response);
}

/** Wire up global.fetch to return a sequence of record pages in order. */
function mockFetchSequence(pages: object[][]) {
  const mock = jest.fn();
  for (const page of pages) {
    mock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ _embedded: { records: page } }),
    } as Response);
  }
  // Fall back to empty page for any call beyond the sequence
  mock.mockResolvedValue({
    ok: true,
    json: async () => ({ _embedded: { records: [] } }),
  } as Response);
  global.fetch = mock;
}

// ─── unit tests for fetchOperations ─────────────────────────────────────────

describe('fetchOperations – cursor direction unit tests', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.NEXT_PUBLIC_HORIZON_URL = 'https://horizon-testnet.stellar.org';
    process.env.NEXT_PUBLIC_CONTRACT_ID = CONTRACT;
  });

  it('bootstrap (no cursor): uses order=desc so newest records come first', async () => {
    mockFetch([makeOp('100'), makeOp('99'), makeOp('98')]);
    const { events, nextCursor } = await fetchOperations(undefined);

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('order=desc');
    expect(url).not.toContain('cursor=');
    // nextCursor = records[0].paging_token under desc order (newest).
    expect(nextCursor).toBe('100');
    // Events delivered newest-first.
    expect(events.map((e) => e.id)).toEqual(['100', '99', '98']);
  });

  it('forward poll (cursor provided): uses order=asc to retrieve newer records', async () => {
    mockFetch([makeOp('101'), makeOp('102')]);
    const { events, nextCursor } = await fetchOperations('100');

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('order=asc');
    expect(url).toContain('cursor=100');
    // nextCursor = records[last].paging_token under asc order (newest in page).
    expect(nextCursor).toBe('102');
    // Events reversed to newest-first for caller consistency.
    expect(events.map((e) => e.id)).toEqual(['102', '101']);
  });

  it('empty bootstrap page: nextCursor stays empty string', async () => {
    mockFetch([]);
    const { nextCursor } = await fetchOperations(undefined);
    expect(nextCursor).toBe('');
  });

  it('empty forward page: nextCursor is preserved from the passed-in cursor', async () => {
    mockFetch([]);
    const { nextCursor } = await fetchOperations('999');
    expect(nextCursor).toBe('999');
  });
});

// ─── polling fallback: no EventSource ────────────────────────────────────────

describe('useContractEvents – polling fallback (no EventSource)', () => {
  const originalEventSource = (global as { EventSource?: unknown }).EventSource;

  beforeEach(() => {
    jest.useFakeTimers();
    // Remove EventSource so the hook goes straight to polling.
    delete (global as { EventSource?: unknown }).EventSource;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    (global as { EventSource?: unknown }).EventSource = originalEventSource;
  });

  // ── AC-4 partial: no EventSource triggers polling ──────────────────────
  it('AC-4: starts polling immediately when EventSource is unavailable', async () => {
    mockFetch([]);
    renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() =>
      expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(1),
    );
  });

  it('returns empty events initially', () => {
    mockFetch([]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    expect(result.current.events).toEqual([]);
  });

  it('populates events after the first successful bootstrap poll', async () => {
    mockFetch([makeOp('1')]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].id).toBe('1');
  });

  it('maps invoke_host_function with register hint to player_registered', async () => {
    mockFetch([makeOp('2', 'register_player')]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].type).toBe('player_registered');
  });

  it('maps invoke_host_function with trial hint to trial_offer_logged', async () => {
    mockFetch([makeOp('3', 'log_trial')]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].type).toBe('trial_offer_logged');
  });

  it('defaults to milestone_approved for generic invoke_host_function', async () => {
    mockFetch([makeOp('4')]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].type).toBe('milestone_approved');
  });

  // ── AC-1: new operation appended between polls appears in state ────────
  it('AC-1: discovers a new operation that arrives between two polls', async () => {
    // Bootstrap: return op '10'. Forward poll: return op '11' (newer).
    // With the fix, the second call uses order=asc&cursor=10 so Horizon
    // returns op '11' — something that was not present at bootstrap time.
    mockFetchSequence([
      [makeOp('10')],   // bootstrap (order=desc, no cursor) → seeds cursor='10'
      [makeOp('11')],   // forward poll (order=asc, cursor='10') → new op
    ]);

    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].id).toBe('10');

    // Advance the interval to trigger the second poll.
    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(result.current.events).toHaveLength(2));
    // Newest-first: op '11' should be at the top.
    expect(result.current.events[0].id).toBe('11');
    expect(result.current.events[1].id).toBe('10');

    // Verify the second request used asc order with cursor from bootstrap.
    const calls = (global.fetch as jest.Mock).mock.calls as string[][];
    const secondUrl = calls[1][0];
    expect(secondUrl).toContain('order=asc');
    expect(secondUrl).toContain('cursor=10');
  });

  // ── AC-2: burst > page size does not silently drop events ─────────────
  it('AC-2: drains multiple pages when more than 20 new ops land between polls', async () => {
    // Bootstrap: a single operation to seed the cursor.
    const bootstrapOp = makeOp('1');
    // First forward poll: full page of 20 new ops (IDs 2-21).
    const page1 = Array.from({ length: 20 }, (_, i) => makeOp(String(i + 2)));
    // Second forward poll (same poll cycle, draining the burst): 5 more ops.
    const page2 = Array.from({ length: 5 }, (_, i) => makeOp(String(i + 22)));
    // Third forward poll (still same cycle): empty — we've caught up.
    // (Not needed; empty is the default fallback in mockFetchSequence.)

    mockFetchSequence([
      [bootstrapOp], // bootstrap → cursor='1'
      page1,         // forward poll #1 (20 ops, full page) → cursor='21'
      page2,         // forward poll #2 drain (5 ops, not full) → cursor='26'
    ]);

    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    // Trigger the second scheduled poll (which internally drains two pages).
    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    // All 25 new ops (2-26) should eventually surface.
    await waitFor(() =>
      expect(result.current.events.length).toBeGreaterThanOrEqual(26),
    );
    const ids = result.current.events.map((e) => e.id);
    // Every id from 1 to 26 must be present.
    for (let i = 1; i <= 26; i++) {
      expect(ids).toContain(String(i));
    }
  });

  // ── AC-3: no duplicate entries across polls ────────────────────────────
  it('AC-3: does not add duplicates when the same op appears in multiple poll responses', async () => {
    // Both the bootstrap and the subsequent forward poll include op '5'
    // (which would happen if Horizon returns an already-seen record).
    mockFetchSequence([
      [makeOp('5')],           // bootstrap
      [makeOp('5'), makeOp('6')], // forward poll overlaps with bootstrap op
    ]);

    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(result.current.events).toHaveLength(2));
    // Op '5' must appear exactly once.
    const ids = result.current.events.map((e) => e.id);
    expect(ids.filter((id) => id === '5')).toHaveLength(1);
    expect(ids).toContain('6');
  });

  it('does not add a duplicate on a poll that returns the same record twice (regression)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ _embedded: { records: [makeOp('7')] } }),
    } as Response);
    global.fetch = fetchMock;

    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    act(() => jest.advanceTimersByTime(30_000));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // Still exactly one event even though the same record was returned twice.
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].id).toBe('7');
  });

  it('prepends new events to the top of the list (newest-first)', async () => {
    mockFetchSequence([
      [makeOp('6')],  // bootstrap
      [makeOp('7')],  // forward poll
    ]);

    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    act(() => jest.advanceTimersByTime(30_000));
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    expect(result.current.events[0].id).toBe('7');
    expect(result.current.events[1].id).toBe('6');
  });

  it('ignores non-invoke_host_function operations', async () => {
    mockFetch([{ id: '8', type: 'payment', created_at: '' }]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() =>
      expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(1),
    );
    expect(result.current.events).toHaveLength(0);
  });

  it('handles fetch errors silently without crashing', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() =>
      expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(1),
    );
    expect(result.current.events).toHaveLength(0);
  });

  it('cleans up the polling interval on unmount', async () => {
    mockFetch([]);
    const clearSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = renderHook(() => useContractEvents(CONTRACT));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  // ── AC-4 continued: correct cursor advance after fallback starts ───────
  it('AC-4: cursor advances correctly after polling is triggered by absent EventSource', async () => {
    mockFetchSequence([
      [makeOp('50')],   // bootstrap → cursor='50'
      [makeOp('51')],   // forward poll (asc, cursor='50')
      [makeOp('52')],   // forward poll (asc, cursor='51')
    ]);

    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    // First timer tick.
    act(() => jest.advanceTimersByTime(30_000));
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    // Second timer tick.
    act(() => jest.advanceTimersByTime(30_000));
    await waitFor(() => expect(result.current.events).toHaveLength(3));

    const calls = (global.fetch as jest.Mock).mock.calls as string[][];
    // Call 0: bootstrap — desc, no cursor.
    expect(calls[0][0]).toContain('order=desc');
    expect(calls[0][0]).not.toContain('cursor=');
    // Call 1: asc from cursor '50'.
    expect(calls[1][0]).toContain('order=asc');
    expect(calls[1][0]).toContain('cursor=50');
    // Call 2: asc from cursor '51' (advanced from previous forward poll).
    expect(calls[2][0]).toContain('order=asc');
    expect(calls[2][0]).toContain('cursor=51');
  });
});

// ─── SSE path: reconnect / backoff / fallback ─────────────────────────────

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  closed = false;
  private listeners: Record<string, Array<(ev: unknown) => void>> = {};

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (ev: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, ev: unknown = {}) {
    (this.listeners[type] ?? []).forEach((cb) => cb(ev));
  }
}

describe('useContractEvents – SSE path with reconnect / backoff', () => {
  const originalEventSource = (global as { EventSource?: unknown }).EventSource;

  beforeEach(() => {
    jest.useFakeTimers();
    MockEventSource.instances = [];
    (global as { EventSource?: unknown }).EventSource =
      MockEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    (global as { EventSource?: unknown }).EventSource = originalEventSource;
  });

  it('marks the feed live once the connection opens', () => {
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    expect(MockEventSource.instances).toHaveLength(1);

    act(() => {
      MockEventSource.instances[0].emit('open');
    });
    expect(result.current.isLive).toBe(true);
  });

  it('reconnects with backoff after a dropped connection and recovers', () => {
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    const first = MockEventSource.instances[0];

    act(() => { first.emit('open'); });
    expect(result.current.isLive).toBe(true);

    act(() => { first.emit('error'); });
    expect(result.current.isLive).toBe(false);
    expect(first.closed).toBe(true);
    // No immediate reconnect — it is backed off.
    expect(MockEventSource.instances).toHaveLength(1);

    act(() => { jest.advanceTimersByTime(BASE_RECONNECT_DELAY_MS); });
    expect(MockEventSource.instances).toHaveLength(2);

    act(() => { MockEventSource.instances[1].emit('open'); });
    expect(result.current.isLive).toBe(true);
  });

  // ── AC-4: SSE-exhausted path triggers polling ──────────────────────────
  it('AC-4: falls back to polling once SSE reconnect attempts are exhausted', async () => {
    mockFetch([]);
    renderHook(() => useContractEvents(CONTRACT));

    // Exhaust all reconnect attempts.
    for (let attempt = 0; attempt <= MAX_RECONNECT_ATTEMPTS; attempt += 1) {
      const current =
        MockEventSource.instances[MockEventSource.instances.length - 1];
      act(() => { current.emit('error'); });
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        act(() => { jest.runOnlyPendingTimers(); });
      }
    }

    expect(MockEventSource.instances).toHaveLength(MAX_RECONNECT_ATTEMPTS + 1);

    // After SSE gives up the polling fallback must start.
    await waitFor(() => expect(global.fetch as jest.Mock).toHaveBeenCalled());
  });

  // ── AC-4 continued: cursor advances after SSE-exhausted fallback ───────
  it('AC-4: cursor advances correctly after polling kicks in via SSE exhaustion', async () => {
    mockFetchSequence([
      [makeOp('200')],   // bootstrap → cursor='200'
      [makeOp('201')],   // forward poll (asc, cursor='200')
    ]);

    renderHook(() => useContractEvents(CONTRACT));

    // Exhaust SSE to trigger polling.
    for (let attempt = 0; attempt <= MAX_RECONNECT_ATTEMPTS; attempt += 1) {
      const current =
        MockEventSource.instances[MockEventSource.instances.length - 1];
      act(() => { current.emit('error'); });
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        act(() => { jest.runOnlyPendingTimers(); });
      }
    }

    // Bootstrap poll should fire.
    await waitFor(() =>
      expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(1),
    );

    // Advance interval to trigger the next forward poll.
    act(() => jest.advanceTimersByTime(30_000));

    await waitFor(() =>
      expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(2),
    );

    const calls = (global.fetch as jest.Mock).mock.calls as string[][];
    // Second call must be forward-advancing (asc + cursor='200').
    expect(calls[1][0]).toContain('order=asc');
    expect(calls[1][0]).toContain('cursor=200');
  });

  it('surfaces an SSE message event as a FeedEvent', () => {
    const { result } = renderHook(() => useContractEvents(CONTRACT));

    act(() => {
      MockEventSource.instances[0].emit('open');
      MockEventSource.instances[0].emit('message', {
        data: JSON.stringify(makeOp('300', 'register_player')),
      });
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].id).toBe('300');
    expect(result.current.events[0].type).toBe('player_registered');
  });

  it('ignores malformed SSE message frames', () => {
    const { result } = renderHook(() => useContractEvents(CONTRACT));

    act(() => {
      MockEventSource.instances[0].emit('open');
      MockEventSource.instances[0].emit('message', { data: 'not json' });
    });

    expect(result.current.events).toHaveLength(0);
  });

  it('cleans up the EventSource on unmount', () => {
    const { unmount } = renderHook(() => useContractEvents(CONTRACT));
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.closed).toBe(true);
  });
});

// ─── MAX_PAGES_PER_POLL guard ────────────────────────────────────────────────

describe('useContractEvents – MAX_PAGES_PER_POLL guard', () => {
  const originalEventSource = (global as { EventSource?: unknown }).EventSource;

  beforeEach(() => {
    jest.useFakeTimers();
    delete (global as { EventSource?: unknown }).EventSource;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    (global as { EventSource?: unknown }).EventSource = originalEventSource;
  });

  it('stops paging after MAX_PAGES_PER_POLL forward pages even when each is full', async () => {
    // Bootstrap page.
    const bootstrapPage = [makeOp('1')];
    // MAX_PAGES_PER_POLL forward pages, each full (20 ops).
    const forwardPages = Array.from({ length: MAX_PAGES_PER_POLL }, (_, p) =>
      Array.from({ length: 20 }, (_, i) =>
        makeOp(String(p * 20 + i + 2)),
      ),
    );

    mockFetchSequence([bootstrapPage, ...forwardPages]);

    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    act(() => jest.advanceTimersByTime(30_000));

    // Wait for fetch calls to complete: 1 bootstrap + MAX_PAGES_PER_POLL forward.
    await waitFor(() =>
      expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(
        1 + MAX_PAGES_PER_POLL,
      ),
    );

    // Exactly MAX_PAGES_PER_POLL forward-page calls were made — no more.
    // (The guard prevented additional fetches even though every page was full.)
    expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(
      1 + MAX_PAGES_PER_POLL,
    );

    // The events list is capped at 50 by the hook's internal slice, but the
    // key assertion is that exactly MAX_PAGES_PER_POLL forward fetches fired —
    // verified above. Events count ≥ 50 confirms the feed populated correctly.
    expect(result.current.events.length).toBe(50);
  });
});
