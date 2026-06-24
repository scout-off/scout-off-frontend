import { renderHook, act } from '@testing-library/react';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Mock the entire lib/contract module so no real Soroban RPC calls are made.
// useIsPaused → useContractHealth → getContractHealth is the actual call chain.
jest.mock('@/lib/contract', () => ({
  getContractHealth: jest.fn(),
}));

import { getContractHealth } from '@/lib/contract';
import useIsPaused from '@/hooks/useIsPaused';
import { useContractHealth } from '@/hooks/useContractHealth';

const mockGetContractHealth = getContractHealth as jest.Mock;

// ── Deferred helper ───────────────────────────────────────────────────────────
// Lets individual tests control exactly when a promise resolves or rejects,
// so we can assert on intermediate (in-flight) state.
function makeDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Drain all pending microtasks so hook state updates settle before asserting.
const flush = () =>
  act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useIsPaused', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // 1 ─ Initial state ──────────────────────────────────────────────────────────
  it('returns false on initial render before the health check resolves', () => {
    // A promise that never resolves keeps the hook perpetually in-flight.
    mockGetContractHealth.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useIsPaused());

    // paused defaults to false in useContractHealth, so useIsPaused must be false
    expect(result.current).toBe(false);
  });

  // 2 ─ Contract is paused ─────────────────────────────────────────────────────
  it('returns true when getContractHealth resolves with paused: true', async () => {
    mockGetContractHealth.mockResolvedValue({ paused: true });

    const { result } = renderHook(() => useIsPaused());
    await flush();

    expect(result.current).toBe(true);
  });

  // 3 ─ Contract is not paused ─────────────────────────────────────────────────
  it('returns false when getContractHealth resolves with paused: false', async () => {
    mockGetContractHealth.mockResolvedValue({ paused: false });

    const { result } = renderHook(() => useIsPaused());
    await flush();

    expect(result.current).toBe(false);
  });

  // 4 ─ Error handling ─────────────────────────────────────────────────────────
  it('returns false and does not throw when getContractHealth rejects', async () => {
    mockGetContractHealth.mockRejectedValue(new Error('RPC unavailable'));

    let result: ReturnType<typeof renderHook<boolean, never>>['result'];
    expect(() => {
      ({ result } = renderHook(() => useIsPaused()));
    }).not.toThrow();

    await flush();

    // useContractHealth catches errors and keeps paused at its false default
    expect(result!.current).toBe(false);
  });

  // 5 ─ Loading lifecycle ───────────────────────────────────────────────────────
  // useIsPaused itself returns only a boolean, so we verify isLoading via
  // useContractHealth (the hook it delegates to) alongside the isPaused value.
  it('isLoading is true while in-flight and false after the check settles, and isPaused updates accordingly', async () => {
    const deferred = makeDeferred<{ paused: boolean }>();
    mockGetContractHealth.mockReturnValue(deferred.promise);

    const { result: healthResult } = renderHook(() => useContractHealth());
    const { result: isPausedResult } = renderHook(() => useIsPaused());

    // ── Before resolution ────────────────────────────────────────────────────
    // useContractHealth initialises loading to true; useIsPaused must be false
    expect(healthResult.current.loading).toBe(true);
    expect(isPausedResult.current).toBe(false);

    // ── Resolve the in-flight request ────────────────────────────────────────
    await act(async () => {
      deferred.resolve({ paused: true });
      await deferred.promise;
    });

    // ── After resolution ─────────────────────────────────────────────────────
    // loading clears in the finally block of useContractHealth.check()
    expect(healthResult.current.loading).toBe(false);
    // isPaused now reflects the resolved value
    expect(isPausedResult.current).toBe(true);
  });
});
