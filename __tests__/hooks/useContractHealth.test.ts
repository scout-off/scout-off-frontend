import { renderHook, act } from '@testing-library/react';
import { useContractHealth } from '@/hooks/useContractHealth';

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

describe('useContractHealth – happy path', () => {
  test('returns healthy:true and paused:false when contract is healthy and not paused', async () => {
    mockGetContractHealth.mockResolvedValue({ paused: false });
    mockGetContractPaused.mockResolvedValue(false);

    const { result } = renderHook(() => useContractHealth());

    // wait for the async effect to finish
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.healthy).toBe(true);
    expect(result.current.paused).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});

describe('useContractHealth – health RPC failure', () => {
  test('sets healthy:false when getContractHealth rejects', async () => {
    mockGetContractHealth.mockRejectedValue(new Error('RPC error'));
    mockGetContractPaused.mockResolvedValue(false);

    const { result } = renderHook(() => useContractHealth());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.healthy).toBe(false);
    // paused remains false (default) when health check fails
    expect(result.current.paused).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});

describe('useContractHealth – paused state', () => {
  test('returns paused:true when contract is paused', async () => {
    mockGetContractHealth.mockResolvedValue({ paused: false });
    mockGetContractPaused.mockResolvedValue(true);

    const { result } = renderHook(() => useContractHealth());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.healthy).toBe(true);
    expect(result.current.paused).toBe(true);
    expect(result.current.loading).toBe(false);
  });
});
