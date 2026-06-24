import { renderHook, act } from '@testing-library/react';
import { useContractStatus } from '@/hooks/useContractStatus';

jest.mock('@/lib/contract', () => ({
  getContractHealth: jest.fn(),
  getContractPaused: jest.fn(),
}));

import { getContractHealth, getContractPaused } from '@/lib/contract';

const mockGetContractHealth = getContractHealth as jest.Mock;
const mockGetContractPaused = getContractPaused as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useContractStatus — initial state', () => {
  test('isLoading is true before requests resolve', () => {
    mockGetContractHealth.mockImplementation(() => new Promise(() => {}));
    mockGetContractPaused.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useContractStatus());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.isHealthy).toBe(true);
  });
});

describe('useContractStatus — healthy, unpaused contract', () => {
  test('sets isHealthy=true and isPaused=false after both calls resolve', async () => {
    mockGetContractHealth.mockResolvedValue({ paused: false });
    mockGetContractPaused.mockResolvedValue(false);

    const { result } = renderHook(() => useContractStatus());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isHealthy).toBe(true);
    expect(result.current.isPaused).toBe(false);
  });
});

describe('useContractStatus — paused contract', () => {
  test('sets isPaused=true when getContractPaused resolves true', async () => {
    mockGetContractHealth.mockResolvedValue({ paused: true });
    mockGetContractPaused.mockResolvedValue(true);

    const { result } = renderHook(() => useContractStatus());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPaused).toBe(true);
    expect(result.current.isHealthy).toBe(true);
  });
});

describe('useContractStatus — error handling', () => {
  test('health call fails → isHealthy=false, isLoading clears, isPaused stays false', async () => {
    mockGetContractHealth.mockRejectedValue(new Error('RPC error'));
    mockGetContractPaused.mockResolvedValue(false);

    const { result } = renderHook(() => useContractStatus());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isHealthy).toBe(false);
    expect(result.current.isPaused).toBe(false);
  });

  test('is_paused call fails → isPaused=false (fail-open), isHealthy preserved, isLoading clears', async () => {
    mockGetContractHealth.mockResolvedValue({ paused: false });
    mockGetContractPaused.mockRejectedValue(new Error('RPC timeout'));

    const { result } = renderHook(() => useContractStatus());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isHealthy).toBe(true);
    expect(result.current.isPaused).toBe(false);
  });

  test('both calls fail → isHealthy=false, isPaused=false, isLoading clears', async () => {
    mockGetContractHealth.mockRejectedValue(new Error('network error'));
    mockGetContractPaused.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useContractStatus());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isHealthy).toBe(false);
    expect(result.current.isPaused).toBe(false);
  });
});

describe('useContractStatus — concurrent execution', () => {
  test('both contract calls are fired before either resolves (Promise.all semantics)', async () => {
    let healthCalled = false;
    let pausedCalled = false;
    let resolveHealth!: (v: unknown) => void;
    let resolvePaused!: (v: unknown) => void;

    mockGetContractHealth.mockImplementation(
      () =>
        new Promise((r) => {
          healthCalled = true;
          resolveHealth = r;
        }),
    );
    mockGetContractPaused.mockImplementation(
      () =>
        new Promise((r) => {
          pausedCalled = true;
          resolvePaused = r;
        }),
    );

    renderHook(() => useContractStatus());

    await act(async () => {
      await Promise.resolve();
    });

    expect(healthCalled).toBe(true);
    expect(pausedCalled).toBe(true);

    await act(async () => {
      resolveHealth({ paused: false });
      resolvePaused(false);
      await Promise.resolve();
    });
  });
});

describe('useContractStatus — polling', () => {
  test('re-polls every 60 seconds', async () => {
    mockGetContractHealth.mockResolvedValue({ paused: false });
    mockGetContractPaused.mockResolvedValue(false);

    renderHook(() => useContractStatus());

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetContractHealth).toHaveBeenCalledTimes(1);
    expect(mockGetContractPaused).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(mockGetContractHealth).toHaveBeenCalledTimes(2);
    expect(mockGetContractPaused).toHaveBeenCalledTimes(2);
  });

  test('clears the interval on unmount', async () => {
    mockGetContractHealth.mockResolvedValue({ paused: false });
    mockGetContractPaused.mockResolvedValue(false);

    const { unmount } = renderHook(() => useContractStatus());

    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(mockGetContractHealth).toHaveBeenCalledTimes(1);
  });
});

describe('useContractStatus — backward compatibility wrappers', () => {
  test('useContractHealth wraps useContractStatus and maps field names', async () => {
    mockGetContractHealth.mockResolvedValue({ paused: false });
    mockGetContractPaused.mockResolvedValue(true);

    const { useContractHealth } = await import('@/hooks/useContractHealth');
    const { result } = renderHook(() => useContractHealth());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.healthy).toBe(true);
    expect(result.current.paused).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  test('useIsPaused returns the paused boolean from the shared status', async () => {
    mockGetContractHealth.mockResolvedValue({ paused: true });
    mockGetContractPaused.mockResolvedValue(true);

    const { default: useIsPaused } = await import('@/hooks/useIsPaused');
    const { result } = renderHook(() => useIsPaused());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toBe(true);
  });
});
