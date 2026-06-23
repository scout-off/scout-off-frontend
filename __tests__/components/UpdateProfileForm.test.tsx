import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import UpdateProfileForm from '@/components/player/UpdateProfileForm';
import { ToastProvider } from '@/components/ui/Toast';
import { ipfsUrl } from '@/lib/ipfs';
import { updateProfile } from '@/lib/contract';
import { useWallet } from '@/hooks/useWallet';
import type { Player } from '@/types';

jest.mock('@/components/ui/VideoUpload', () => ({
  __esModule: true,
  default: ({ onUpload }: { onUpload: (cid: string) => void }) => (
    <button type="button" onClick={() => onUpload('new-cid-1234567890')}>
      Upload new media
    </button>
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

  it('keeps the submit button disabled until a new CID is obtained', () => {
    renderComponent();

    const submit = screen.getByRole('button', { name: /update profile/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /upload new media/i }));
    expect(submit).toBeEnabled();
  });

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
});
