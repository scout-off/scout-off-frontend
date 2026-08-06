import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useContractEvents,
  MAX_RECONNECT_ATTEMPTS,
  BASE_RECONNECT_DELAY_MS,
} from '@/hooks/useContractEvents';

const CONTRACT =
  'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678';

function makeOp(id: string, fnHint = '') {
  return {
    id,
    paging_token: id,
    type: 'invoke_host_function',
    function: fnHint,
    created_at: '2026-01-01T00:00:00Z',
    transaction_hash: 'txhash_' + id,
  };
}

function mockFetch(records: object[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ _embedded: { records } }),
  } as Response);
}

describe('useContractEvents (polling fallback)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns empty events initially', () => {
    mockFetch([]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    expect(result.current.events).toEqual([]);
  });

  it('populates events after first successful poll', async () => {
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

  it('deduplicates events across polls', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ _embedded: { records: [makeOp('5')] } }),
    } as Response);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    await waitFor(() =>
      expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(2),
    );
    expect(result.current.events).toHaveLength(1);
  });

  it('prepends new events to the top of the list', async () => {
    global.fetch = (jest.fn() as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ _embedded: { records: [makeOp('6')] } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ _embedded: { records: [makeOp('7')] } }),
      } as Response);

    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    act(() => {
      jest.advanceTimersByTime(30_000);
    });
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
});

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

describe('useContractEvents (SSE path with reconnect/backoff)', () => {
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

    act(() => {
      first.emit('open');
    });
    expect(result.current.isLive).toBe(true);

    // Simulate a transient drop.
    act(() => {
      first.emit('error');
    });
    expect(result.current.isLive).toBe(false);
    expect(first.closed).toBe(true);
    // Reconnect is backed off, not immediate.
    expect(MockEventSource.instances).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(BASE_RECONNECT_DELAY_MS);
    });
    expect(MockEventSource.instances).toHaveLength(2);

    // Recovery: the new connection opens successfully.
    act(() => {
      MockEventSource.instances[1].emit('open');
    });
    expect(result.current.isLive).toBe(true);
  });

  it('falls back to polling once reconnect attempts are exhausted', async () => {
    mockFetch([]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));

    // Fail the SSE connection MAX_RECONNECT_ATTEMPTS + 1 times in a row,
    // advancing the backoff timer between each failure so the hook
    // re-attempts a connection each time — until it gives up on SSE.
    for (let attempt = 0; attempt <= MAX_RECONNECT_ATTEMPTS; attempt += 1) {
      const current =
        MockEventSource.instances[MockEventSource.instances.length - 1];
      act(() => {
        current.emit('error');
      });
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        act(() => {
          jest.runOnlyPendingTimers();
        });
      }
    }

    // One initial connection + one reconnect per failed attempt.
    expect(MockEventSource.instances).toHaveLength(MAX_RECONNECT_ATTEMPTS + 1);
    expect(result.current.isLive).toBe(false);

    // Having given up on SSE, the hook falls back to polling instead of
    // staying silently dead.
    await waitFor(() => expect(global.fetch as jest.Mock).toHaveBeenCalled());
  });
});
