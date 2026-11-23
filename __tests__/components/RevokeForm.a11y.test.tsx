import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import RevokeForm from '@/components/validator/RevokeForm';
import { useWallet } from '@/hooks/useWallet';
import { useValidator } from '@/hooks/useValidator';
import type { Player } from '@/types';

expect.extend(toHaveNoViolations);

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

describe('RevokeForm – accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('axe-core violations', () => {
    it('has no axe violations in its initial state', async () => {
      const { container } = renderComponent();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no axe violations when an error is shown after revocation failure', async () => {
      const revokeMilestone = jest
        .fn()
        .mockRejectedValue(new Error('Revocation failed'));

      const { container } = renderComponent({ revokeMilestone });

      // Select the milestone
      fireEvent.click(screen.getByRole('button', { name: /scored 10 goals/i }));
      // Click revoke
      fireEvent.click(
        screen.getByRole('button', { name: /revoke selected milestone/i }),
      );
      // Confirm in dialog
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
      });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('form-level error summary', () => {
    it('shows a role="alert" error summary after a failed revocation', async () => {
      const revokeMilestone = jest
        .fn()
        .mockRejectedValue(new Error('Revocation failed'));

      renderComponent({ revokeMilestone });

      fireEvent.click(screen.getByRole('button', { name: /scored 10 goals/i }));
      fireEvent.click(
        screen.getByRole('button', { name: /revoke selected milestone/i }),
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
      });

      const errorSummary = screen.getByRole('alert', {
        name: /revocation error/i,
      });
      expect(errorSummary).toBeInTheDocument();
      expect(errorSummary).toHaveTextContent('Revocation failed');
    });

    it('error summary has a stable id', async () => {
      const revokeMilestone = jest
        .fn()
        .mockRejectedValue(new Error('Transaction error'));

      renderComponent({ revokeMilestone });

      fireEvent.click(screen.getByRole('button', { name: /scored 10 goals/i }));
      fireEvent.click(
        screen.getByRole('button', { name: /revoke selected milestone/i }),
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
      });

      const errorEl = document.getElementById('revoke-error-summary');
      expect(errorEl).toBeTruthy();
      expect(errorEl).toHaveTextContent('Transaction error');
    });

    it('does not show error summary before any revocation attempt', () => {
      renderComponent();
      expect(
        screen.queryByRole('alert', { name: /revocation error/i }),
      ).toBeNull();
    });
  });

  describe('aria-invalid and aria-describedby on the revoke button', () => {
    it('revoke button has aria-describedby pointing to error summary when error exists', async () => {
      const revokeMilestone = jest
        .fn()
        .mockRejectedValue(new Error('Revocation failed'));

      renderComponent({ revokeMilestone });

      fireEvent.click(screen.getByRole('button', { name: /scored 10 goals/i }));
      fireEvent.click(
        screen.getByRole('button', { name: /revoke selected milestone/i }),
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
      });

      const revokeButton = screen.getByRole('button', {
        name: /revoke selected milestone/i,
      });
      expect(revokeButton).toHaveAttribute(
        'aria-describedby',
        'revoke-error-summary',
      );
    });

    it('revoke button has no aria-describedby when there is no error', () => {
      renderComponent();
      const revokeButton = screen.getByRole('button', {
        name: /revoke selected milestone/i,
      });
      expect(revokeButton).not.toHaveAttribute('aria-describedby');
    });
  });

  describe('focus management', () => {
    it('moves focus to the error summary after a failed revocation', async () => {
      const revokeMilestone = jest
        .fn()
        .mockRejectedValue(new Error('Revocation failed'));

      renderComponent({ revokeMilestone });

      fireEvent.click(screen.getByRole('button', { name: /scored 10 goals/i }));
      fireEvent.click(
        screen.getByRole('button', { name: /revoke selected milestone/i }),
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
      });

      const errorSummary = screen.getByRole('alert', {
        name: /revocation error/i,
      });
      // Focus moves via setTimeout(..., 0) in the component, so wait for it
      // rather than asserting immediately after the click.
      await waitFor(() => expect(document.activeElement).toBe(errorSummary));
    });
  });
});
