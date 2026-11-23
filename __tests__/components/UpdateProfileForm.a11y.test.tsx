import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import UpdateProfileForm from '@/components/player/UpdateProfileForm';
import { ToastProvider } from '@/components/ui/Toast';
import { updateProfile } from '@/lib/contract';
import { useWallet } from '@/hooks/useWallet';
import type { Player } from '@/types';

expect.extend(toHaveNoViolations);

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

describe('UpdateProfileForm – accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('axe-core violations', () => {
    it('has no axe violations in its initial state', async () => {
      const { container } = renderComponent();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no axe violations after a contract failure', async () => {
      mockedUpdateProfile.mockRejectedValue(new Error('Contract error'));
      const { container } = renderComponent();

      fireEvent.click(
        screen.getByRole('button', { name: /upload new media/i }),
      );

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /update profile/i }),
        );
      });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('form-level error summary', () => {
    it('shows a role="alert" error summary after a failed contract call', async () => {
      mockedUpdateProfile.mockRejectedValue(new Error('Contract error'));
      renderComponent();

      fireEvent.click(
        screen.getByRole('button', { name: /upload new media/i }),
      );

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /update profile/i }),
        );
      });

      const alert = screen.getByRole('alert', {
        name: /form submission error/i,
      });
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(/failed to update profile media/i);
    });

    it('does not show an error summary before any submission', () => {
      renderComponent();
      expect(
        screen.queryByRole('alert', { name: /form submission error/i }),
      ).toBeNull();
    });

    it('clears the error summary when a new upload is performed', async () => {
      mockedUpdateProfile.mockRejectedValue(new Error('Contract error'));
      renderComponent();

      fireEvent.click(
        screen.getByRole('button', { name: /upload new media/i }),
      );

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /update profile/i }),
        );
      });

      expect(
        screen.getByRole('alert', { name: /form submission error/i }),
      ).toBeInTheDocument();

      // A new upload clears the error
      fireEvent.click(
        screen.getByRole('button', { name: /upload new media/i }),
      );

      expect(
        screen.queryByRole('alert', { name: /form submission error/i }),
      ).toBeNull();
    });
  });
});
