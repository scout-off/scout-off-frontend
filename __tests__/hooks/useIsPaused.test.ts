import { renderHook, act } from '@testing-library/react';

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock('@/lib/contract', () => ({
  getContractHealth: jest.fn(),
  getContractPaused: jest.fn(),
}));

import { getContractHealth, getContractPaused } from '@/lib/contract';
import useIsPaused from '@/hooks/useIsPaused';
import { useContractHealth } from '@/hooks/useContractHealth';

const mockGetContractHealth = getContractHealth as jest.Mock;
const mockGetContractPaused = getContractPaused as jest.Mock;

// ── Deferred helper ───────────────────────────────────────────────────────────
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
    mockGetContractPaused.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useIsPaused());

    // paused defaults to false in useContractStatus, so useIsPaused must be false
    expect(result.current).toBe(false);
  });

  // 2 ─ Contract is paused ─────────────────────────────────────────────────────
  it('returns true when getContractPaused resolves with true', async () => {
    mockGetContractHealth.mockResolvedValue({});
    mockGetContractPaused.mockResolvedValue(true);

    const { result } = renderHook(() => useIsPaused());
    await flush();

    expect(result.current).toBe(true);
  });

  // 3 ─ Contract is not paused ─────────────────────────────────────────────────
  it('returns false when getContractPaused resolves with false', async () => {
    mockGetContractHealth.mockResolvedValue({});
    mockGetContractPaused.mockResolvedValue(false);

    const { result } = renderHook(() => useIsPaused());
    await flush();

    expect(result.current).toBe(false);
  });

  // 4 ─ Error handling ─────────────────────────────────────────────────────────
  it('returns false and does not throw when getContractHealth rejects', async () => {
    mockGetContractHealth.mockRejectedValue(new Error('RPC unavailable'));
    mockGetContractPaused.mockResolvedValue(false);

    let result: ReturnType<typeof renderHook<boolean, never>>['result'];
    expect(() => {
      ({ result } = renderHook(() => useIsPaused()));
    }).not.toThrow();

    await flush();

    // useContractStatus catches errors and keeps isPaused at its false default
    expect(result!.current).toBe(false);
  });

  // 5 ─ Loading lifecycle ───────────────────────────────────────────────────────
  // useIsPaused itself returns only a boolean, so we verify isLoading via
  // useContractHealth (the hook it delegates to) alongside the isPaused value.
  it('isLoading is true while in-flight and false after the check settles, and isPaused updates accordingly', async () => {
    const deferred = makeDeferred<boolean>();
    mockGetContractHealth.mockResolvedValue({});
    mockGetContractPaused.mockReturnValue(deferred.promise);

    const { result: healthResult } = renderHook(() => useContractHealth());
    const { result: isPausedResult } = renderHook(() => useIsPaused());

    // ── Before resolution ────────────────────────────────────────────────────
    // useContractHealth initialises loading to true; useIsPaused must be false
    expect(healthResult.current.loading).toBe(true);
    expect(isPausedResult.current).toBe(false);

    // ── Resolve the in-flight request ────────────────────────────────────────
    await act(async () => {
      deferred.resolve(true);
      await deferred.promise;
    });

    // ── After resolution ─────────────────────────────────────────────────────
    expect(healthResult.current.loading).toBe(false);
    // isPaused now reflects the resolved value from getContractPaused
    expect(isPausedResult.current).toBe(true);
  });
});

// ── Explicit paused / unpaused / error scenarios (acceptance criteria) ────────
//
// These three named cases satisfy the task requirement for coverage of each
// distinct circuit-breaker state.  They also exercise the relationship between
// the hook's boolean return value and the underlying useContractHealth data so
// that ContractPausedBanner's rendering logic is indirectly verified.

describe('useIsPaused — paused state', () => {
  beforeEach(() => jest.resetAllMocks());

  // AC: mock contract isPaused → true; hook surfaces { isPaused: true, loading: false }
  it('surfaces isPaused:true and loading:false once the contract query resolves with true', async () => {
    mockGetContractHealth.mockResolvedValue({ status: 'ok' });
    mockGetContractPaused.mockResolvedValue(true);

    const { result: healthResult } = renderHook(() => useContractHealth());
    const { result: isPausedResult } = renderHook(() => useIsPaused());

    // Settle all async state updates
    await flush();

    expect(isPausedResult.current).toBe(true); // isPaused: true
    expect(healthResult.current.loading).toBe(false); // loading: false
    expect(healthResult.current.paused).toBe(true); // underlying source agrees
  });

  // Verify getContractPaused was called (mock data accurately simulates contract)
  it('calls getContractPaused exactly once per render cycle', async () => {
    mockGetContractHealth.mockResolvedValue({});
    mockGetContractPaused.mockResolvedValue(true);

    renderHook(() => useIsPaused());
    await flush();

    expect(mockGetContractPaused).toHaveBeenCalledTimes(1);
  });
});

describe('useIsPaused — unpaused state', () => {
  beforeEach(() => jest.resetAllMocks());

  it('surfaces isPaused:false and loading:false once the contract query resolves with false', async () => {
    mockGetContractHealth.mockResolvedValue({ status: 'ok' });
    mockGetContractPaused.mockResolvedValue(false);

    const { result: healthResult } = renderHook(() => useContractHealth());
    const { result: isPausedResult } = renderHook(() => useIsPaused());

    await flush();

    expect(isPausedResult.current).toBe(false); // isPaused: false
    expect(healthResult.current.loading).toBe(false); // loading: false
    expect(healthResult.current.paused).toBe(false); // underlying source agrees
  });
});

describe('useIsPaused — error state (fail-open)', () => {
  beforeEach(() => jest.resetAllMocks());

  // AC: when the contract query fails, isPaused defaults to false (fail-open for
  // read-only display) so ContractPausedBanner does not show a false positive.
  it('defaults isPaused to false when getContractPaused rejects (fail-open)', async () => {
    mockGetContractHealth.mockResolvedValue({});
    mockGetContractPaused.mockRejectedValue(new Error('RPC timeout'));

    const { result } = renderHook(() => useIsPaused());
    await flush();

    // fail-open: error must NOT trigger the paused banner
    expect(result.current).toBe(false);
  });

  it('defaults isPaused to false when both getContractHealth and getContractPaused reject', async () => {
    mockGetContractHealth.mockRejectedValue(new Error('network error'));
    mockGetContractPaused.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useIsPaused());
    await flush();

    expect(result.current).toBe(false);
  });

  // AC: SWR cache / polling re-evaluation — simulate a re-mount (equivalent to
  // a polling interval firing) and verify the hook picks up a newly-paused state.
  it('re-evaluates isPaused on re-mount, picking up a newly paused state', async () => {
    // First render: contract healthy and NOT paused
    mockGetContractHealth.mockResolvedValue({});
    mockGetContractPaused.mockResolvedValue(false);

    const { result, unmount } = renderHook(() => useIsPaused());
    await flush();
    expect(result.current).toBe(false);

    unmount();

    // Second render (simulates polling or component re-mount): contract IS paused now
    mockGetContractPaused.mockResolvedValue(true);

    const { result: result2 } = renderHook(() => useIsPaused());
    await flush();
    expect(result2.current).toBe(true);
  });
});
