import { renderHook, act } from '@testing-library/react';
import { useContractCompatibility } from '@/hooks/useContractCompatibility';

jest.mock('@/lib/contract', () => ({
  checkContractCompatibility: jest.fn(),
}));

import { checkContractCompatibility } from '@/lib/contract';

const mockCheck = checkContractCompatibility as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useContractCompatibility', () => {
  test('defaults to unknown/loading before the check resolves', () => {
    mockCheck.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useContractCompatibility());

    expect(result.current.status).toBe('unknown');
    expect(result.current.isIncompatible).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  test('reflects a compatible result', async () => {
    mockCheck.mockResolvedValue({
      status: 'compatible',
      deployedVersion: 1,
      expectedVersion: 1,
      message: null,
    });

    const { result } = renderHook(() => useContractCompatibility());
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('compatible');
    expect(result.current.isIncompatible).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  test('reflects an incompatible result with its message', async () => {
    mockCheck.mockResolvedValue({
      status: 'incompatible',
      deployedVersion: 2,
      expectedVersion: 1,
      message: 'please update the app',
    });

    const { result } = renderHook(() => useContractCompatibility());
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('incompatible');
    expect(result.current.isIncompatible).toBe(true);
    expect(result.current.message).toBe('please update the app');
  });
});
