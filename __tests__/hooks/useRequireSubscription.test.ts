import { renderHook } from '@testing-library/react';
import { useRequireSubscription } from '@/hooks/useRequireSubscription';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

const mockShow = jest.fn();
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show: mockShow }),
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: jest.fn(),
}));

import { useWallet } from '@/hooks/useWallet';
import { useSubscription } from '@/hooks/useSubscription';

const mockUseWallet = useWallet as jest.Mock;
const mockUseSubscription = useSubscription as jest.Mock;

describe('useRequireSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing while the subscription is still loading', () => {
    mockUseWallet.mockReturnValue({ publicKey: 'GPUBLICKEY' });
    mockUseSubscription.mockReturnValue({
      subscription: null,
      isExpired: false,
      loading: true,
    });

    const { result } = renderHook(() => useRequireSubscription());

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockShow).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    expect(result.current.isProtected).toBe(false);
  });

  it('does nothing when no wallet is connected (left to useRequireWallet)', () => {
    mockUseWallet.mockReturnValue({ publicKey: null });
    mockUseSubscription.mockReturnValue({
      subscription: null,
      isExpired: false,
      loading: false,
    });

    renderHook(() => useRequireSubscription());

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('redirects and toasts a warning when there is no subscription', () => {
    mockUseWallet.mockReturnValue({ publicKey: 'GPUBLICKEY' });
    mockUseSubscription.mockReturnValue({
      subscription: null,
      isExpired: false,
      loading: false,
    });

    renderHook(() => useRequireSubscription());

    expect(mockShow).toHaveBeenCalledWith({
      message: 'Your subscription has expired — please renew to continue.',
      variant: 'warning',
    });
    expect(mockReplace).toHaveBeenCalledWith('/en/scout/subscribe');
  });

  it('redirects when the subscription exists but is expired', () => {
    mockUseWallet.mockReturnValue({ publicKey: 'GPUBLICKEY' });
    mockUseSubscription.mockReturnValue({
      subscription: { scout: 'GPUBLICKEY', tier: 'basic', expiresAt: 1 },
      isExpired: true,
      loading: false,
    });

    renderHook(() => useRequireSubscription());

    expect(mockReplace).toHaveBeenCalledWith('/en/scout/subscribe');
  });

  it('does not redirect when a valid, non-expired subscription exists', () => {
    mockUseWallet.mockReturnValue({ publicKey: 'GPUBLICKEY' });
    mockUseSubscription.mockReturnValue({
      subscription: { scout: 'GPUBLICKEY', tier: 'pro', expiresAt: 9e15 },
      isExpired: false,
      loading: false,
    });

    const { result } = renderHook(() => useRequireSubscription());

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockShow).not.toHaveBeenCalled();
    expect(result.current.isProtected).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('returns isProtected: false while loading, regardless of subscription state', () => {
    mockUseWallet.mockReturnValue({ publicKey: 'GPUBLICKEY' });
    mockUseSubscription.mockReturnValue({
      subscription: { scout: 'GPUBLICKEY', tier: 'pro', expiresAt: 9e15 },
      isExpired: false,
      loading: true,
    });

    const { result } = renderHook(() => useRequireSubscription());

    expect(result.current.isProtected).toBe(true);
    expect(result.current.loading).toBe(true);
  });
});
