import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import UpdateProfileForm from '@/components/player/UpdateProfileForm';
import { ToastProvider } from '@/components/ui/Toast';
import { updateProfile } from '@/lib/contract';
import { useWallet } from '@/hooks/useWallet';
import type { Player } from '@/types';

// ── VideoUpload mock ──────────────────────────────────────────────────────────
// Exposes three buttons so tests can drive the three outcomes:
//   "Upload new media"   → success path  (calls onUpload)
//   "Upload invalid type" → type error   (calls onValidationError)
//   "Upload oversized"   → size error    (calls onValidationError)

jest.mock('@/components/ui/VideoUpload', () => ({
  __esModule: true,
  default: ({
    onUpload,
    onValidationError,
  }: {
    onUpload: (cid: string) => void;
    onValidationError?: (error: string | null) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onUpload('new-cid-1234567890')}>
        Upload new media
      </button>
      <button
        type="button"
        onClick={() =>
          onValidationError?.(
            'File type "application/pdf" is not supported. Please upload MP4, MOV, JPEG, PNG.',
          )
        }
      >
        Upload invalid type
      </button>
      <button
        type="button"
        onClick={() =>
          onValidationError?.(
            'File is too large (60.0 MB). Maximum size is 50 MB.',
          )
        }
      >
        Upload oversized
      </button>
    </div>
  ),
}));

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

jest.mock('@/lib/contract', () => ({
  updateProfile: jest.fn(),
}));

jest.mock('@/hooks/useIsPaused', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue(false),
}));

const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedUpdateProfile = updateProfile as jest.MockedFunction<
  typeof updateProfile
>;

const player: Player = {
  id: 'player-1',
  wallet: 'GABC123PUBLICKEY',
  vitals: {
    name: 'Test Player',
    age: 20,
    position: 'Forward',
    region: 'West Africa',
    nationality: 'Nigerian',
  },
  ipfsHash: 'Qmabcdef1234567890abcdef1234567890abcdef12',
  progressLevel: 0,
  milestones: [],
  createdAt: 1234567890,
};

function renderComponent(onSuccess = jest.fn()) {
  mockedUseWallet.mockReturnValue({
    publicKey: player.wallet,
    isAuthenticated: true,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSubmit: jest.fn(),
  } as any);

  return render(
    <ToastProvider>
      <UpdateProfileForm player={player} onSuccess={onSuccess} />
    </ToastProvider>,
  );
}

describe('UpdateProfileForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Visibility ──────────────────────────────────────────────────────────────

  it('does not render when the connected wallet does not match the player wallet', () => {
    mockedUseWallet.mockReturnValue({
      publicKey: 'OTHERPUBLICKEY',
      isAuthenticated: true,
      isConnecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signAndSubmit: jest.fn(),
    } as any);

    render(
      <ToastProvider>
        <UpdateProfileForm player={player} onSuccess={jest.fn()} />
      </ToastProvider>,
    );

    expect(screen.queryByText(/Update Profile Media/i)).toBeNull();
  });

  it('shows the current IPFS hash truncated with a gateway link', () => {
    renderComponent();

    const truncated = `${player.ipfsHash.slice(0, 8)}…${player.ipfsHash.slice(-8)}`;
    const link = screen.getByRole('link', { name: truncated });

    expect(link).toBeInTheDocument();
    const expectedHref = `${process.env.NEXT_PUBLIC_IPFS_GATEWAY}/${player.ipfsHash}`;
    expect(link).toHaveAttribute('href', expectedHref);
  });

  // ── Submit button state ─────────────────────────────────────────────────────

  it('keeps the submit button disabled until a new CID is obtained', () => {
    renderComponent();

    const submit = screen.getByRole('button', { name: /update profile/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /upload new media/i }));
    expect(submit).toBeEnabled();
  });

  it('disables submit button when file type is invalid', () => {
    renderComponent();

    fireEvent.click(
      screen.getByRole('button', { name: /upload invalid type/i }),
    );

    expect(screen.getByRole('button', { name: /update profile/i })).toBeDisabled();
  });

  it('disables submit button when file is oversized', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /upload oversized/i }));

    expect(screen.getByRole('button', { name: /update profile/i })).toBeDisabled();
  });

  it('re-enables submit after a validation error is followed by a valid upload', () => {
    renderComponent();

    fireEvent.click(
      screen.getByRole('button', { name: /upload invalid type/i }),
    );
    expect(screen.getByRole('button', { name: /update profile/i })).toBeDisabled();

    // Valid upload clears the error and provides a CID
    fireEvent.click(screen.getByRole('button', { name: /upload new media/i }));
    expect(screen.getByRole('button', { name: /update profile/i })).toBeEnabled();
  });

  // ── Inline error messages ───────────────────────────────────────────────────

  it('does not show a file validation error before any file is selected', () => {
    renderComponent();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an inline error when an invalid file type is selected', () => {
    renderComponent();

    fireEvent.click(
      screen.getByRole('button', { name: /upload invalid type/i }),
    );

    expect(
      screen.getByText(/file type .* is not supported/i),
    ).toBeInTheDocument();
  });

  it('shows an inline error when an oversized file is selected', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /upload oversized/i }));

    expect(screen.getByText(/file is too large/i)).toBeInTheDocument();
  });

  it('clears the file error once a valid file is uploaded', () => {
    renderComponent();

    fireEvent.click(
      screen.getByRole('button', { name: /upload invalid type/i }),
    );
    expect(screen.getByText(/file type .* is not supported/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /upload new media/i }));
    expect(
      screen.queryByText(/file type .* is not supported/i),
    ).not.toBeInTheDocument();
  });

  // ── Successful submission ───────────────────────────────────────────────────

  it('calls updateProfile with the new CID and invokes onSuccess after a successful transaction', async () => {
    const onSuccess = jest.fn();
    mockedUpdateProfile.mockResolvedValue({
      status: 'PENDING',
      hash: 'tx-hash',
      latestLedger: 1,
      latestLedgerCloseTime: 1,
    } as any);

    renderComponent(onSuccess);

    fireEvent.click(screen.getByRole('button', { name: /upload new media/i }));

    const submit = screen.getByRole('button', { name: /update profile/i });
    await act(async () => {
      fireEvent.click(submit);
    });

    expect(mockedUpdateProfile).toHaveBeenCalledWith(
      player.wallet,
      player.id,
      'new-cid-1234567890',
      expect.any(Function),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('does not call updateProfile when no file has been uploaded', async () => {
    renderComponent();

    // Force-click despite disabled state to confirm the guard
    const submit = screen.getByRole('button', { name: /update profile/i });
    await act(async () => {
      fireEvent.click(submit);
    });

    expect(mockedUpdateProfile).not.toHaveBeenCalled();
  });

  it('does not call updateProfile when a file validation error is present', async () => {
    renderComponent();

    fireEvent.click(
      screen.getByRole('button', { name: /upload invalid type/i }),
    );

    const submit = screen.getByRole('button', { name: /update profile/i });
    await act(async () => {
      fireEvent.click(submit);
    });

    expect(mockedUpdateProfile).not.toHaveBeenCalled();
  });

  // ── Contract failure ────────────────────────────────────────────────────────

  it('displays an error message when updateProfile fails', async () => {
    const onSuccess = jest.fn();
    mockedUpdateProfile.mockRejectedValue(new Error('Transaction failed'));

    renderComponent(onSuccess);

    fireEvent.click(screen.getByRole('button', { name: /upload new media/i }));
    const submit = screen.getByRole('button', { name: /update profile/i });
    await act(async () => {
      fireEvent.click(submit);
    });

    expect(mockedUpdateProfile).toHaveBeenCalled();
    expect(
      screen.getByText(/Failed to update profile media/i),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
