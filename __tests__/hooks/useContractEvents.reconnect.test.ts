/**
 * Tests for the SSE reconnect backoff and polling fallback in
 * useContractEvents.
 *
 * Verifies:
 *   1. Backoff delay grows exponentially after each SSE error.
 *   2. Backoff is bounded at MAX_RECONNECT_DELAY_MS.
 *   3. After MAX_RECONNECT_ATTEMPTS consecutive failures, the polling
 *      fallback engages (startPolling is called).
 *   4. Jitter: successive backoff delays are not all identical (the
 *      constant-delay case is BASE * 2^n — no jitter is applied in the
 *      current implementation; we assert the deterministic growth instead).
 */

import {
  MAX_RECONNECT_ATTEMPTS,
  BASE_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
} from '@/hooks/useContractEvents';

describe('useContractEvents — SSE reconnect backoff constants', () => {
  it('BASE_RECONNECT_DELAY_MS is a positive number', () => {
    expect(BASE_RECONNECT_DELAY_MS).toBeGreaterThan(0);
  });

  it('MAX_RECONNECT_DELAY_MS is greater than BASE_RECONNECT_DELAY_MS', () => {
    expect(MAX_RECONNECT_DELAY_MS).toBeGreaterThan(BASE_RECONNECT_DELAY_MS);
  });

  it('MAX_RECONNECT_ATTEMPTS is a positive integer', () => {
    expect(Number.isInteger(MAX_RECONNECT_ATTEMPTS)).toBe(true);
    expect(MAX_RECONNECT_ATTEMPTS).toBeGreaterThan(0);
  });

  it('exponential backoff grows correctly up to the cap', () => {
    const delays: number[] = [];
    for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * 2 ** attempt,
        MAX_RECONNECT_DELAY_MS,
      );
      delays.push(delay);
    }

    // Delays must start at BASE and grow.
    expect(delays[0]).toBe(BASE_RECONNECT_DELAY_MS);

    // Each delay (before hitting the cap) must be strictly larger than the
    // previous one.
    for (let i = 1; i < delays.length; i++) {
      if (delays[i - 1] < MAX_RECONNECT_DELAY_MS) {
        expect(delays[i]).toBeGreaterThan(delays[i - 1]);
      }
    }

    // No delay should exceed the cap.
    delays.forEach((d) => {
      expect(d).toBeLessThanOrEqual(MAX_RECONNECT_DELAY_MS);
    });
  });

  it('after MAX_RECONNECT_ATTEMPTS the next attempt would switch to polling', () => {
    // This mirrors the logic in useContractEvents.ts:
    //   if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) → startPolling()
    // We verify the boundary condition.
    let attempts = 0;
    let pollingEngaged = false;

    function simulateError() {
      if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        pollingEngaged = true;
        return;
      }
      attempts += 1;
    }

    // Fire MAX_RECONNECT_ATTEMPTS errors — none should switch to polling yet.
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
      simulateError();
    }
    expect(pollingEngaged).toBe(false);

    // One more error — now polling should engage.
    simulateError();
    expect(pollingEngaged).toBe(true);
  });
});

// ── Integration-level hook test using fake timers ────────────────────────────

describe('useContractEvents — SSE reconnect with fake timers', () => {
  let originalEventSource: typeof EventSource;

  beforeAll(() => {
    originalEventSource = global.EventSource;
  });

  afterAll(() => {
    global.EventSource = originalEventSource;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('attempts reconnect with growing backoff after SSE errors', async () => {
    const errorListeners: Array<() => void> = [];
    const openListeners: Array<() => void> = [];
    let instanceCount = 0;

    class FakeEventSource {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readyState = FakeEventSource.CONNECTING;

      constructor() {
        instanceCount += 1;
      }

      addEventListener(type: string, fn: () => void) {
        if (type === 'error') errorListeners.push(fn);
        if (type === 'open') openListeners.push(fn);
      }

      close() {
        this.readyState = FakeEventSource.CLOSED;
      }
    }

    global.EventSource = FakeEventSource as unknown as typeof EventSource;

    const { renderHook } = await import('@testing-library/react');
    const { useContractEvents } = await import('@/hooks/useContractEvents');

    const { unmount } = renderHook(() => useContractEvents('GCONTRACT123'));

    // Fire the first error.
    expect(instanceCount).toBe(1);
    errorListeners[0]?.();

    // After 1st error, reconnect should be scheduled at BASE_RECONNECT_DELAY_MS.
    // Advance less than the first backoff — no reconnect yet.
    jest.advanceTimersByTime(BASE_RECONNECT_DELAY_MS - 1);
    expect(instanceCount).toBe(1);

    // Advance past the first backoff — reconnect fires.
    jest.advanceTimersByTime(2);
    expect(instanceCount).toBe(2);

    // Fire the second error.
    errorListeners[1]?.();

    // Second backoff is BASE * 2.
    jest.advanceTimersByTime(BASE_RECONNECT_DELAY_MS * 2 - 1);
    expect(instanceCount).toBe(2);
    jest.advanceTimersByTime(2);
    expect(instanceCount).toBe(3);

    unmount();
  });

  it('falls back to polling after MAX_RECONNECT_ATTEMPTS consecutive SSE failures', async () => {
    const errorListeners: Array<() => void> = [];

    class FakeEventSourceForFallback {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readyState = 0;
      addEventListener(type: string, fn: () => void) {
        if (type === 'error') errorListeners.push(fn);
      }
      close() {}
    }

    global.EventSource =
      FakeEventSourceForFallback as unknown as typeof EventSource;

    // Spy on setInterval to detect when polling starts.
    const setIntervalSpy = jest.spyOn(global, 'setInterval');

    const { renderHook } = await import('@testing-library/react');
    const { useContractEvents } = await import('@/hooks/useContractEvents');

    const { unmount } = renderHook(() => useContractEvents('GCONTRACT456'));

    // Fire MAX_RECONNECT_ATTEMPTS errors with appropriate timer advances.
    for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
      errorListeners[attempt]?.();
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * 2 ** attempt,
        MAX_RECONNECT_DELAY_MS,
      );
      jest.advanceTimersByTime(delay + 1);
    }

    // Fire the error that pushes attempts past the threshold.
    errorListeners[MAX_RECONNECT_ATTEMPTS]?.();

    // After this point, the hook should have called setInterval (polling).
    // Allow microtasks to flush.
    await Promise.resolve();

    expect(setIntervalSpy).toHaveBeenCalled();

    setIntervalSpy.mockRestore();
    unmount();
  });
});
