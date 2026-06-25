import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RevokeForm from '@/components/validator/RevokeForm';
import { useWallet } from '@/hooks/useWallet';
import { useValidator } from '@/hooks/useValidator';
import type { Player } from '@/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/stellar', () => ({
  rpc: {
    getAccount: jest.fn(),
    prepareTransaction: jest.fn(),
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
  },
  NETWORK: 'TESTNET',
  BASE_FEE: '100',
}));

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/hooks/useValidator', () => ({
  useValidator: jest.fn(),
}));

jest.mock('@/hooks/useIsPaused', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue(false),
}));

jest.mock('@/components/ui/ConfirmDialog', () => ({
  __esModule: true,
  default: ({
    isOpen,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    message: string;
    confirmLabel: string;
    loading: boolean;
  }) =>
    isOpen ? (
      <div role="dialog">
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedUseValidator = useValidator as jest.MockedFunction<
  typeof useValidator
>;

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALIDATOR_KEY = 'GVALIDATORPUBLICKEY';

const player: Player = {
  id: 'player-1',
  wallet: 'GPLAYERPUBLICKEY',
  vitals: {
    name: 'Test Player',
    age: 22,
    position: 'ST',
    region: 'nigeria',
    nationality: 'Nigerian',
  },
  ipfsHash: 'QmTestHash',
  progressLevel: 1,
  milestones: [
    {
      id: 'milestone-1',
      description: 'Scored 10 goals',
      evidenceHash: 'QmEvidenceHash',
      validator: VALIDATOR_KEY,
      timestamp: 1700000000,
    },
    {
      id: 'milestone-2',
      description: 'Professional contract signed',
      evidenceHash: 'QmEvidenceHash2',
      validator: VALIDATOR_KEY,
      timestamp: 1700000001,
    },
  ],
  createdAt: 1234567890,
};

function renderComponent(
  overrides: Partial<ReturnType<typeof useValidator>> = {},
  onSuccess = jest.fn(),
) {
  mockedUseWallet.mockReturnValue({
    publicKey: VALIDATOR_KEY,
    isAuthenticated: true,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSubmit: jest.fn(),
  } as any);

  mockedUseValidator.mockReturnValue({
    isValidator: true,
    checking: false,
    approveMilestone: jest.fn(),
    revokeMilestone: jest.fn().mockResolvedValue({}),
    loading: false,
    error: null,
    ...overrides,
  });

  return render(<RevokeForm player={player} onSuccess={onSuccess} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RevokeForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Render milestone selection list ────────────────────────────────────────

  it('renders milestone selection list from player prop', () => {
    renderComponent();
    expect(screen.getByText('Scored 10 goals')).toBeInTheDocument();
    expect(
      screen.getByText('Professional contract signed'),
    ).toBeInTheDocument();
  });

  // ── Validation - revoke button disabled when no milestone selected ───────────

  it('shows validation - revoke button disabled when no milestone selected', () => {
    renderComponent();
    const revokeButton = screen.getByRole('button', {
      name: /revoke selected milestone/i,
    });
    expect(revokeButton).toBeDisabled();
  });

  it('enables revoke button when a milestone is selected', () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /scored 10 goals/i }));
    const revokeButton = screen.getByRole('button', {
      name: /revoke selected milestone/i,
    });
    expect(revokeButton).not.toBeDisabled();
  });

  // ── Disables submit button during transaction submission ───────────────────

  it('disables submit button during transaction submission', async () => {
    let resolveRevoke: (val: any) => void;
    const revokeMilestone = jest.fn().mockReturnValue(
      new Promise((res) => {
        resolveRevoke = res;
      }),
    );

    renderComponent({ revokeMilestone });

    // Select milestone
    fireEvent.click(screen.getByRole('button', { name: /scored 10 goals/i }));
    // Click revoke
    fireEvent.click(
      screen.getByRole('button', { name: /revoke selected milestone/i }),
    );
    // Confirm in dialog
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    });

    await waitFor(() => {
      const revokeButton = screen.getByRole('button', {
        name: /revoking/i,
      });
      expect(revokeButton).toBeDisabled();
    });

    await act(async () => {
      resolveRevoke!({});
    });
  });

  // ── Calls onSuccess after successful revoke ────────────────────────────────

  it('calls onSuccess after a successful revoke', async () => {
    const revokeMilestone = jest.fn().mockResolvedValue({});
    const onSuccess = jest.fn();

    renderComponent({ revokeMilestone }, onSuccess);

    // Select milestone
    fireEvent.click(screen.getByRole('button', { name: /scored 10 goals/i }));
    // Click revoke
    fireEvent.click(
      screen.getByRole('button', { name: /revoke selected milestone/i }),
    );
    // Confirm in dialog
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    });

    expect(revokeMilestone).toHaveBeenCalledWith('player-1', 'milestone-1');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  // ── Shows error message when contract call fails ───────────────────────────

  it('shows error message when contract call fails (e.g. UnauthorizedValidator)', async () => {
    const revokeMilestone = jest
      .fn()
      .mockRejectedValue(new Error('UnauthorizedValidator'));

    renderComponent({ revokeMilestone });

    // Select milestone
    fireEvent.click(screen.getByRole('button', { name: /scored 10 goals/i }));
    // Click revoke
    fireEvent.click(
      screen.getByRole('button', { name: /revoke selected milestone/i }),
    );
    // Confirm in dialog
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('UnauthorizedValidator')).toBeInTheDocument();
    });
  });

  // ── Shows ConfirmDialog before submitting ───────────────────────────────────

  it('shows a ConfirmDialog before submitting', () => {
    renderComponent();

    // Select milestone
    fireEvent.click(screen.getByRole('button', { name: /scored 10 goals/i }));
    // Click revoke - should open dialog
    fireEvent.click(
      screen.getByRole('button', { name: /revoke selected milestone/i }),
    );

    // Dialog should be visible
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^confirm$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
  });

  it('does not call revokeMilestone when dialog is cancelled', () => {
    const revokeMilestone = jest.fn().mockResolvedValue({});
    renderComponent({ revokeMilestone });

    // Select milestone
    fireEvent.click(screen.getByRole('button', { name: /scored 10 goals/i }));
    // Click revoke
    fireEvent.click(
      screen.getByRole('button', { name: /revoke selected milestone/i }),
    );
    // Cancel in dialog
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(revokeMilestone).not.toHaveBeenCalled();
  });
});
