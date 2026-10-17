import { renderHook, act, waitFor } from '@testing-library/react';

const mockShow = jest.fn();
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show: mockShow }),
}));
jest.mock('@/lib/contract', () => ({
  getValidators: jest.fn(),
  getPlatformFees: jest.fn(),
  getContractPaused: jest.fn(),
}));

import {
  getValidators,
  getPlatformFees,
  getContractPaused,
} from '@/lib/contract';
import { useAdminContractState } from '@/hooks/useAdminContractState';

const mockGetValidators = getValidators as jest.Mock;
const mockGetFees = getPlatformFees as jest.Mock;
const mockGetPaused = getContractPaused as jest.Mock;

const validators = [{ address: 'GVAL1' }, { address: 'GVAL2' }];

describe('useAdminContractState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetValidators.mockResolvedValue(validators);
    mockGetFees.mockResolvedValue(42);
    mockGetPaused.mockResolvedValue(true);
  });

  it('starts in a loading state with empty defaults', () => {
    const { result } = renderHook(() => useAdminContractState());
    expect(result.current.loading).toBe(true);
    expect(result.current.validators).toEqual([]);
    expect(result.current.fees).toBeNull();
    expect(result.current.paused).toBe(false);
    expect(result.current.fetchError).toBe(false);
  });

  it('populates state from the contract reads', async () => {
    const { result } = renderHook(() => useAdminContractState());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.validators).toEqual(validators);
    expect(result.current.fees).toBe(42);
    expect(result.current.paused).toBe(true);
    expect(result.current.fetchError).toBe(false);
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('sets fetchError and shows a toast when a read fails, keeping defaults', async () => {
    mockGetFees.mockRejectedValue(new Error('rpc down'));
    const { result } = renderHook(() => useAdminContractState());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.fetchError).toBe(true);
    expect(result.current.validators).toEqual([]);
    expect(result.current.fees).toBeNull();
    expect(mockShow).toHaveBeenCalledWith({
      message: 'Failed to load admin data.',
      variant: 'error',
    });
  });

  it('reload triggers new reads and clears a previous error', async () => {
    mockGetValidators.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useAdminContractState());
    await waitFor(() => expect(result.current.fetchError).toBe(true));
    expect(mockGetValidators).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.reload();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetValidators).toHaveBeenCalledTimes(2);
    expect(mockGetFees).toHaveBeenCalledTimes(2);
    expect(mockGetPaused).toHaveBeenCalledTimes(2);
    expect(result.current.fetchError).toBe(false);
    expect(result.current.validators).toEqual(validators);
  });

  it('exposes setters for optimistic local updates', async () => {
    const { result } = renderHook(() => useAdminContractState());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setPaused(false);
      result.current.setFees(0);
    });
    expect(result.current.paused).toBe(false);
    expect(result.current.fees).toBe(0);
  });

  it('does not produce React warnings when unmounted during an in-flight read', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let resolveValidators!: (v: unknown) => void;
    mockGetValidators.mockReturnValue(
      new Promise((res) => {
        resolveValidators = res;
      }),
    );
    const { unmount } = renderHook(() => useAdminContractState());
    unmount();
    await act(async () => {
      resolveValidators(validators);
      await Promise.resolve();
    });
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
