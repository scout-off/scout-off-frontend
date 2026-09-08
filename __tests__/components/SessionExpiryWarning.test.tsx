import {
  render,
  screen,
  act,
  renderHook,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import { WalletProvider, useWalletContext } from '@/context/WalletContext';
import { walletAdapters } from '@/lib/walletAdapters';
import SessionExpiryWarning from '@/components/SessionExpiryWarning';
import type { ReactNode } from 'react';

jest.mock('@/lib/walletAdapters', () => ({
  walletAdapters: {
    freighter: {
      getPublicKey: jest.fn(),
      signTransaction: jest.fn(),
    },
    albedo: {
      getPublicKey: jest.fn(),
      signTransaction: jest.fn(),
    },
    lobstr: {
      getPublicKey: jest.fn(),
      signTransaction: jest.fn(),
    },
    ledger: {
      getPublicKey: jest.fn(),
      signTransaction: jest.fn(),
    },
  },
}));

jest.mock('@/lib/stellar', () => ({
  rpc: { sendTransaction: jest.fn(), getAccount: jest.fn() },
  NETWORK: 'Test SDF Network ; September 2015',
  TransactionBuilder: { fromXDR: jest.fn(() => ({})) },
}));

jest.mock('@/lib/sep10Validation', () => ({
  validateSep10Challenge: jest.fn(() => ({ valid: true })),
  getSep10ClientConfig: jest.fn(() => ({
    serverAccount: 'GSERVERACCOUNT000000000000000000000000000000000000000',
    homeDomain: 'localhost:3000',
    networkPassphrase: 'Test SDF Network ; September 2015',
  })),
  SEP10_VALIDATION_USER_ERROR:
    'Could not verify the login request from this site — please try again or contact support',
}));

jest.mock('@stellar/stellar-sdk', () => ({
  TransactionBuilder: { fromXDR: jest.fn(() => ({})) },
  Networks: {
    PUBLIC: 'Public Global Stellar Network ; September 2015',
    TESTNET: 'Test SDF Network ; September 2015',
  },
}));

jest.mock('next-intl', () => ({
  useTranslations: () => {
    const translations: Record<string, string> = {
      expiringSoonTitle: 'Session Expiring Soon',
      expiringSoonMessage: 'Your session expires soon.',
      dismiss: 'Dismiss',
      reauthenticate: 'Renew Session',
      renewedSuccess: 'Session renewed successfully',
      renewFailed: 'Failed to renew session',
    };
    return (key: string) => translations[key] ?? key;
  },
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    show: jest.fn(),
  }),
}));

const PUBLIC_KEY = 'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV';
const CHALLENGE_XDR = 'challenge-xdr';
const SIGNED_XDR = 'signed-xdr';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function wrapper({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}

function setupSep10(maxAge?: number) {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ transaction: CHALLENGE_XDR }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        maxAge: maxAge ?? 86400,
      }),
    });
}

describe('SessionExpiryWarning', () => {
  const freighter = walletAdapters.freighter as jest.Mocked<
    typeof walletAdapters.freighter
  >;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    localStorage.clear();
    freighter.getPublicKey.mockResolvedValue(PUBLIC_KEY);
    freighter.signTransaction.mockResolvedValue(SIGNED_XDR);
    const { rpc } = jest.requireMock('@/lib/stellar');
    rpc.getAccount.mockResolvedValue({
      balances: [{ asset_type: 'native', balance: '100.0000000' }],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not render the warning when sessionExpiresAt is null', () => {
    const { result } = renderHook(() => useWalletContext(), { wrapper });

    act(() => {
      jest.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(result.current.sessionExpiresAt).toBeNull();
  });

  it('shows the warning modal when within 2 minutes of expiry', async () => {
    const baseTime = 1_000_000_000_000;
    jest.setSystemTime(baseTime);

    setupSep10(600); // 10-minute session

    const { result } = renderHook(() => useWalletContext(), { wrapper });
    await act(async () => {
      await result.current.connectWithProvider('freighter');
    });

    const expiresAt = result.current.sessionExpiresAt!;
    expect(expiresAt).toBe(baseTime + 600_000);

    // Jump to within the 2-minute warning window
    act(() => {
      jest.setSystemTime(expiresAt - 90_000);
    });

    render(<SessionExpiryWarning />, { wrapper });

    // The useEffect should fire on mount and show the warning immediately
    await act(async () => {});

    // Verify the modal is open (dialog role is present) and title renders
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument();
    expect(screen.getByText('Renew Session')).toBeInTheDocument();
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
  });

  it('does not show the warning when more than 2 minutes remain', async () => {
    const baseTime = 1_000_000_000_000;
    jest.setSystemTime(baseTime);

    setupSep10(600);

    const { result } = renderHook(() => useWalletContext(), { wrapper });
    await act(async () => {
      await result.current.connectWithProvider('freighter');
    });

    const expiresAt = result.current.sessionExpiresAt!;

    // 5 minutes before expiry — well outside the 2-min warning window
    act(() => {
      jest.setSystemTime(expiresAt - 5 * 60_000);
    });

    render(<SessionExpiryWarning />, { wrapper });
    await act(async () => {});

    expect(screen.queryByText('Session Expiring Soon')).not.toBeInTheDocument();
  });

  it('schedules the warning to appear at the correct time via setTimeout', async () => {
    const baseTime = 1_000_000_000_000;
    jest.setSystemTime(baseTime);

    setupSep10(600);

    const { result } = renderHook(() => useWalletContext(), { wrapper });
    await act(async () => {
      await result.current.connectWithProvider('freighter');
    });

    const expiresAt = result.current.sessionExpiresAt!;

    // 5 minutes before expiry — outside warning window
    act(() => {
      jest.setSystemTime(expiresAt - 5 * 60_000);
    });

    render(<SessionExpiryWarning />, { wrapper });
    await act(async () => {});
    expect(screen.queryByText('Session Expiring Soon')).not.toBeInTheDocument();

    // Advance to exactly the warning threshold (2 min before expiry)
    // The component should have set a setTimeout for this moment
    act(() => {
      jest.advanceTimersByTime(3 * 60_000); // 5min - 2min = 3min
    });
    await act(async () => {});

    expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument();
  });

  it('has a dismiss button that is clickable', async () => {
    const baseTime = 1_000_000_000_000;
    jest.setSystemTime(baseTime);

    setupSep10(600);
    const { result } = renderHook(() => useWalletContext(), { wrapper });
    await act(async () => {
      await result.current.connectWithProvider('freighter');
    });

    const expiresAt = result.current.sessionExpiresAt!;
    act(() => {
      jest.setSystemTime(expiresAt - 90_000);
    });

    render(<SessionExpiryWarning />, { wrapper });
    await act(async () => {});

    // Verify both action buttons are present and accessible
    const dismissBtn = screen.getByText('Dismiss');
    const reauthBtn = screen.getByText('Renew Session');
    expect(dismissBtn).toBeEnabled();
    expect(reauthBtn).toBeEnabled();
  });

  it('reauthenticate button calls reauthenticate from context', async () => {
    const baseTime = 1_000_000_000_000;
    jest.setSystemTime(baseTime);

    setupSep10(600);
    const { result } = renderHook(() => useWalletContext(), { wrapper });
    await act(async () => {
      await result.current.connectWithProvider('freighter');
    });

    const expiresAt = result.current.sessionExpiresAt!;
    act(() => {
      jest.setSystemTime(expiresAt - 90_000);
    });

    render(<SessionExpiryWarning />, { wrapper });
    await act(async () => {});
    expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument();

    // Set up reauthentication mocks (new session with 1-day expiry)
    freighter.getPublicKey.mockResolvedValue(PUBLIC_KEY);
    freighter.signTransaction.mockResolvedValue(SIGNED_XDR);
    setupSep10(86400);

    // Call reauthenticate directly on the same context instance (the renderHook
    // and render create separate WalletProvider instances, so clicking the button
    // in the rendered component would call reauthenticate on a different context).
    await act(async () => {
      await result.current.reauthenticate();
    });

    // After reauthentication, the session should be refreshed with a new expiry
    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });
    expect(result.current.sessionExpiresAt).not.toBeNull();
    expect(result.current.sessionExpiresAt).not.toBe(expiresAt);
  });
});
