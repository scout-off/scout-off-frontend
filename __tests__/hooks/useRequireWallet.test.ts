import { renderHook } from '@testing-library/react';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { REDIRECT_REASONS } from '@/lib/redirectReason';

const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockWalletContext = {
  isAuthenticated: false,
  isConnecting: false,
  isRestoringSession: false,
  publicKey: null as string | null,
};

jest.mock('@/context/WalletContext', () => ({
  useWalletContext: () => mockWalletContext,
}));

describe('useRequireWallet', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockWalletContext.isAuthenticated = false;
    mockWalletContext.isConnecting = false;
    mockWalletContext.isRestoringSession = false;
    mockWalletContext.publicKey = null;
  });

  it('redirects to home with a reason when unauthenticated and not connecting', () => {
    renderHook(() => useRequireWallet());
    expect(mockReplace).toHaveBeenCalledWith('/?reason=wallet-required');
  });

  it('does not redirect when authenticated', () => {
    mockWalletContext.isAuthenticated = true;
    renderHook(() => useRequireWallet());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect while session restore is in progress', () => {
    mockWalletContext.isConnecting = true;
    renderHook(() => useRequireWallet());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('uses router.replace (not push) to prevent back-navigation', () => {
    renderHook(() => useRequireWallet());
    expect(mockReplace).toHaveBeenCalledWith('/?reason=wallet-required');
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
    );
  });

  // ── #894: redirect destination URL and reason query param ─────────────────

  it('redirects to a URL containing the wallet-required reason query param', () => {
    renderHook(() => useRequireWallet());

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const redirectUrl: string = mockReplace.mock.calls[0][0];
    const url = new URL(redirectUrl, 'http://localhost');
    expect(url.searchParams.get('reason')).toBe('wallet-required');
  });

  it('redirect reason matches an entry in REDIRECT_REASONS', () => {
    renderHook(() => useRequireWallet());

    const redirectUrl: string = mockReplace.mock.calls[0][0];
    const url = new URL(redirectUrl, 'http://localhost');
    const reason = url.searchParams.get(
      'reason',
    ) as keyof typeof REDIRECT_REASONS;
    expect(reason).toBeDefined();
    expect(REDIRECT_REASONS[reason]).toBeDefined();
  });

  it('does not redirect when the wallet is connected (isAuthenticated = true)', () => {
    mockWalletContext.isAuthenticated = true;
    mockWalletContext.publicKey =
      'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV';
    renderHook(() => useRequireWallet());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect while isRestoringSession is true', () => {
    mockWalletContext.isRestoringSession = true;
    renderHook(() => useRequireWallet());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('returns the walletAddress from publicKey', () => {
    const key = 'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV';
    mockWalletContext.isAuthenticated = true;
    mockWalletContext.publicKey = key;
    const { result } = renderHook(() => useRequireWallet());
    expect(result.current.walletAddress).toBe(key);
  });
});
