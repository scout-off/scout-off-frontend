import { render, screen, waitFor, act } from '@testing-library/react';
import ValidatorDashboard from '@/app/[locale]/validator/page';
import type { Player } from '@/types';

let mockWalletAddress: string | null = null;
const mockCheckIsValidator = jest.fn();

jest.mock('@/hooks/useRequireWallet', () => ({
  useRequireWallet: () => ({ walletAddress: mockWalletAddress }),
}));

jest.mock('@/lib/contract', () => ({
  checkIsValidator: (...args: unknown[]) => mockCheckIsValidator(...args),
}));

jest.mock('@/components/ui/ErrorBoundary', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/ui/EmptyState', () => ({
  __esModule: true,
  default: ({
    title,
    description,
  }: {
    title: string;
    description?: string;
  }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      {description && <p>{description}</p>}
    </div>
  ),
}));

let capturedOnSelect: ((player: Player) => void) | null = null;
jest.mock('@/components/validator/ValidatorPlayerSearch', () => ({
  __esModule: true,
  default: ({ onSelect }: { onSelect: (player: Player) => void }) => {
    capturedOnSelect = onSelect;
    return <div data-testid="player-search">Find a Player</div>;
  },
}));

jest.mock('@/components/validator/ApproveForm', () => ({
  __esModule: true,
  default: () => <div data-testid="approve-form">Approve form</div>,
}));

jest.mock('@/components/validator/RevokeForm', () => ({
  __esModule: true,
  default: ({ player }: { player: Player }) => (
    <div data-testid="revoke-form">Revoke form for {player.id}</div>
  ),
}));

const samplePlayer: Player = {
  id: 'player-1',
  wallet: 'GPLAYERWALLET0000000000000000000000000000000000000000000',
  vitals: {
    name: 'Jane Doe',
    age: 21,
    position: 'Forward',
    region: 'EU',
    nationality: 'French',
  },
  ipfsHash: 'CID123',
  progressLevel: 0,
  milestones: [],
  createdAt: 0,
};

describe('ValidatorDashboard page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWalletAddress = null;
    capturedOnSelect = null;
  });

  it('renders nothing when there is no wallet address', () => {
    mockWalletAddress = null;
    const { container } = render(<ValidatorDashboard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a loading message while checking validator authorization', () => {
    mockWalletAddress =
      'GVALIDATOR000000000000000000000000000000000000000000000';
    mockCheckIsValidator.mockReturnValue(new Promise(() => {})); // never resolves

    render(<ValidatorDashboard />);

    expect(screen.getByText('Validator Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Verifying validator status…')).toBeInTheDocument();
  });

  it('shows an empty state when the wallet is not an authorized validator', async () => {
    mockWalletAddress =
      'GNOTVALIDATOR00000000000000000000000000000000000000000';
    mockCheckIsValidator.mockResolvedValue(false);

    render(<ValidatorDashboard />);

    expect(
      await screen.findByText('Validator Access Only'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Your wallet is not registered as an approved validator/,
      ),
    ).toBeInTheDocument();
  });

  it('treats a rejected authorization check as not authorized', async () => {
    mockWalletAddress =
      'GNOTVALIDATOR00000000000000000000000000000000000000000';
    mockCheckIsValidator.mockRejectedValue(new Error('rpc down'));

    render(<ValidatorDashboard />);

    expect(
      await screen.findByText('Validator Access Only'),
    ).toBeInTheDocument();
  });

  it('renders the player search once authorized as a validator', async () => {
    mockWalletAddress =
      'GVALIDATOR000000000000000000000000000000000000000000000';
    mockCheckIsValidator.mockResolvedValue(true);

    render(<ValidatorDashboard />);

    expect(await screen.findByTestId('player-search')).toBeInTheDocument();
    expect(screen.queryByTestId('approve-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('revoke-form')).not.toBeInTheDocument();
  });

  it('shows player details and approve/revoke forms once a player is selected', async () => {
    mockWalletAddress =
      'GVALIDATOR000000000000000000000000000000000000000000000';
    mockCheckIsValidator.mockResolvedValue(true);

    render(<ValidatorDashboard />);
    await screen.findByTestId('player-search');

    expect(capturedOnSelect).not.toBeNull();
    act(() => {
      (capturedOnSelect as (player: Player) => void)(samplePlayer);
    });

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
    expect(screen.getByText(/Forward · EU· French/)).toBeInTheDocument();
    expect(screen.getByText('ID: player-1')).toBeInTheDocument();
    expect(screen.getByTestId('approve-form')).toBeInTheDocument();
    expect(screen.getByTestId('revoke-form')).toHaveTextContent('player-1');
  });

  it('calls checkIsValidator with the connected wallet address', async () => {
    mockWalletAddress =
      'GVALIDATOR000000000000000000000000000000000000000000000';
    mockCheckIsValidator.mockResolvedValue(true);

    render(<ValidatorDashboard />);

    await waitFor(() => {
      expect(mockCheckIsValidator).toHaveBeenCalledWith(mockWalletAddress);
    });
  });
});
