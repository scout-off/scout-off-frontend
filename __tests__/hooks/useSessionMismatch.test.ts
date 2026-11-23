import { renderHook } from '@testing-library/react';

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

import { useWallet } from '@/hooks/useWallet';
import { useSessionMismatch } from '@/hooks/useSessionMismatch';

const mockUseWallet = useWallet as jest.Mock;

describe('useSessionMismatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when the wallet reports a session mismatch', () => {
    mockUseWallet.mockReturnValue({ sessionMismatch: true });
    const { result } = renderHook(() => useSessionMismatch());
    expect(result.current).toBe(true);
  });

  it('returns false when there is no mismatch', () => {
    mockUseWallet.mockReturnValue({ sessionMismatch: false });
    const { result } = renderHook(() => useSessionMismatch());
    expect(result.current).toBe(false);
  });

  it('updates when the wallet context value changes', () => {
    mockUseWallet.mockReturnValue({ sessionMismatch: false });
    const { result, rerender } = renderHook(() => useSessionMismatch());
    expect(result.current).toBe(false);

    mockUseWallet.mockReturnValue({ sessionMismatch: true });
    rerender();
    expect(result.current).toBe(true);

    mockUseWallet.mockReturnValue({ sessionMismatch: false });
    rerender();
    expect(result.current).toBe(false);
  });
});
