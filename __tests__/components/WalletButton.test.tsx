import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WalletButton from '@/components/WalletButton';
import { ToastProvider } from '@/components/ui/Toast';
import { useWallet } from '@/hooks/useWallet';

function renderWalletButton() {
  return render(
    <ToastProvider>
      <WalletButton />
    </ToastProvider>,
  );
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockConnect = jest.fn();
const mockConnectWithProvider = jest.fn();

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

const mockUseWallet = useWallet as jest.Mock;

const DISCONNECTED_STATE = {
  publicKey: null,
  connect: mockConnect,
  disconnect: jest.fn(),
  isConnecting: false,
  connectingProvider: null,
  xlmBalance: null,
  balanceError: null,
  isLoadingBalance: false,
  walletProviderInfo: null,
  showWalletModal: true,
  closeWalletModal: jest.fn(),
  connectWithProvider: mockConnectWithProvider,
};

// Mirrors context/WalletContext.tsx's real WALLET_PROVIDERS/WALLET_INSTALL_URLS
// — LOBSTR flagged comingSoon since lib/walletAdapters.ts's lobstr adapter is
// still a stub that unconditionally throws.
jest.mock('@/context/WalletContext', () => ({
  WALLET_PROVIDERS: [
    { provider: 'freighter', label: 'Freighter', icon: '🔶' },
    { provider: 'albedo', label: 'Albedo', icon: '✨' },
    { provider: 'lobstr', label: 'LOBSTR', icon: '🌐', comingSoon: true },
    { provider: 'ledger', label: 'Ledger', icon: '💎' },
  ],
  WALLET_INSTALL_URLS: {
    freighter: 'https://freighter.app',
    albedo: 'https://albedo.link',
    lobstr: 'https://lobstr.co',
    ledger: 'https://www.ledger.com/stellar-wallet',
  },
  isWalletInstalled: jest.fn().mockResolvedValue(true),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUseWallet.mockReturnValue(DISCONNECTED_STATE);
});

describe('WalletButton — wallet-connect modal', () => {
  it('renders the LOBSTR option as disabled', async () => {
    renderWalletButton();

    const lobstrButton = (await screen.findByText('LOBSTR')).closest(
      'button',
    );

    expect(lobstrButton).not.toBeNull();
    expect(lobstrButton).toBeDisabled();
  });

  it('cannot be driven to trigger a LOBSTR connect attempt through normal interaction', async () => {
    const user = userEvent.setup();
    renderWalletButton();

    const lobstrButton = (await screen.findByText('LOBSTR')).closest(
      'button',
    ) as HTMLButtonElement;

    await user.click(lobstrButton);

    expect(mockConnectWithProvider).not.toHaveBeenCalled();
  });

  it('still allows connecting to a fully supported provider like Freighter', async () => {
    const user = userEvent.setup();
    renderWalletButton();

    const freighterButton = (await screen.findByText('Freighter')).closest(
      'button',
    ) as HTMLButtonElement;

    await user.click(freighterButton);

    expect(mockConnectWithProvider).toHaveBeenCalledWith('freighter', false);
  });
});

describe('WalletButton — disconnected state', () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({
      ...DISCONNECTED_STATE,
      showWalletModal: false,
    });
  });

  it('shows a "Connect Wallet" affordance', () => {
    renderWalletButton();

    expect(
      screen.getByRole('button', { name: 'Connect Wallet' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/…/)).not.toBeInTheDocument();
  });

  it('starts the wallet adapter selection flow when clicked', async () => {
    const user = userEvent.setup();
    renderWalletButton();

    await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('shows a connecting label and disables the button while connecting', () => {
    mockUseWallet.mockReturnValue({
      ...DISCONNECTED_STATE,
      showWalletModal: false,
      isConnecting: true,
    });
    renderWalletButton();

    const button = screen.getByRole('button', { name: 'Connecting…' });
    expect(button).toBeDisabled();
  });

  it('lets the user pick a provider from the wallet selection modal', async () => {
    const user = userEvent.setup();
    mockUseWallet.mockReturnValue(DISCONNECTED_STATE);
    renderWalletButton();

    const freighterButton = (await screen.findByText('Freighter')).closest(
      'button',
    ) as HTMLButtonElement;
    await user.click(freighterButton);

    expect(mockConnectWithProvider).toHaveBeenCalledWith('freighter', false);
  });
});

describe('WalletButton — connected state', () => {
  const PUBLIC_KEY =
    'GCONNECTEDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  beforeEach(() => {
    mockUseWallet.mockReturnValue({
      ...DISCONNECTED_STATE,
      publicKey: PUBLIC_KEY,
      showWalletModal: false,
      xlmBalance: '123.45',
    });
  });

  it('shows the truncated wallet address instead of "Connect Wallet"', () => {
    renderWalletButton();

    expect(screen.getByText('GCON…AAAA')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Connect Wallet' }),
    ).not.toBeInTheDocument();
  });

  it('exposes a disconnect action labelled with the truncated address', () => {
    renderWalletButton();

    expect(
      screen.getByRole('button', {
        name: 'Disconnect Wallet — GCON…AAAA',
      }),
    ).toBeInTheDocument();
  });

  it('shows the XLM balance', () => {
    renderWalletButton();

    expect(screen.getByText('123.45 XLM')).toBeInTheDocument();
  });
});
