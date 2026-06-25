import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import ApproveForm from '@/components/validator/ApproveForm';
import { useWallet } from '@/hooks/useWallet';
import { useValidator } from '@/hooks/useValidator';

expect.extend(toHaveNoViolations);

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/hooks/useValidator', () => ({
  useValidator: jest.fn(),
}));

jest.mock('@/lib/contract', () => ({
  getPlayer: jest.fn(),
}));

jest.mock('@/hooks/useIsPaused', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue(false),
}));

const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedUseValidator = useValidator as jest.MockedFunction<
  typeof useValidator
>;

function renderComponent(onSuccess = jest.fn()) {
  mockedUseWallet.mockReturnValue({
    publicKey: 'GVALIDATORPUBLICKEY',
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
    revokeMilestone: jest.fn(),
    loading: false,
    error: null,
  });

  return render(<ApproveForm onSuccess={onSuccess} />);
}

describe('ApproveForm – accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('axe-core violations', () => {
    it('has no axe violations in its initial state', async () => {
      const { container } = renderComponent();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no axe violations when the URL error is shown', async () => {
      const { container } = renderComponent();
      const urlInput = screen.getByPlaceholderText(
        'https://example.com/evidence',
      );
      fireEvent.change(urlInput, { target: { value: 'not-a-url' } });
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('labels and input associations', () => {
    it('associates the Player ID label with its input via htmlFor/id', () => {
      renderComponent();
      const label = screen.getByText('Player ID');
      const input = screen.getByPlaceholderText('Enter player ID');
      expect(label).toHaveAttribute('for', 'approve-player-id');
      expect(input).toHaveAttribute('id', 'approve-player-id');
    });

    it('associates the Milestone Description label with its textarea', () => {
      renderComponent();
      const label = screen.getByText('Milestone Description');
      const textarea = screen.getByPlaceholderText(
        /Describe the player's achievement/i,
      );
      expect(label).toHaveAttribute('for', 'approve-description');
      expect(textarea).toHaveAttribute('id', 'approve-description');
    });

    it('associates the Evidence URL label with its input', () => {
      renderComponent();
      const label = screen.getByText('Evidence URL');
      const input = screen.getByPlaceholderText(
        'https://example.com/evidence',
      );
      expect(label).toHaveAttribute('for', 'approve-evidence-url');
      expect(input).toHaveAttribute('id', 'approve-evidence-url');
    });
  });

  describe('field-level error ARIA linkage', () => {
    it('sets aria-invalid on evidence URL input when URL is invalid', () => {
      renderComponent();
      const urlInput = screen.getByPlaceholderText(
        'https://example.com/evidence',
      );
      fireEvent.change(urlInput, { target: { value: 'invalid-url' } });
      expect(urlInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('links URL error message via aria-describedby', () => {
      renderComponent();
      const urlInput = screen.getByPlaceholderText(
        'https://example.com/evidence',
      );
      fireEvent.change(urlInput, { target: { value: 'invalid-url' } });
      const describedById = urlInput.getAttribute('aria-describedby');
      expect(describedById).toBe('approve-url-error');
      const errorEl = document.getElementById('approve-url-error');
      expect(errorEl).toBeTruthy();
      expect(errorEl).toHaveTextContent(
        'Evidence URL must be a valid http/https URL',
      );
    });

    it('error message for URL has role="alert"', () => {
      renderComponent();
      const urlInput = screen.getByPlaceholderText(
        'https://example.com/evidence',
      );
      fireEvent.change(urlInput, { target: { value: 'invalid-url' } });
      const errorEl = document.getElementById('approve-url-error');
      expect(errorEl).toHaveAttribute('role', 'alert');
    });

    it('clears aria-invalid from URL input after URL is corrected', () => {
      renderComponent();
      const urlInput = screen.getByPlaceholderText(
        'https://example.com/evidence',
      );
      fireEvent.change(urlInput, { target: { value: 'invalid-url' } });
      expect(urlInput).toHaveAttribute('aria-invalid', 'true');
      fireEvent.change(urlInput, {
        target: { value: 'https://example.com/evidence' },
      });
      expect(urlInput).not.toHaveAttribute('aria-invalid');
    });

    it('does not set aria-invalid on evidence URL input when it is empty', () => {
      renderComponent();
      const urlInput = screen.getByPlaceholderText(
        'https://example.com/evidence',
      );
      expect(urlInput).not.toHaveAttribute('aria-invalid');
    });

    it('does not set aria-invalid on URL input when URL is valid', () => {
      renderComponent();
      const urlInput = screen.getByPlaceholderText(
        'https://example.com/evidence',
      );
      fireEvent.change(urlInput, {
        target: { value: 'https://valid.example.com' },
      });
      expect(urlInput).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('form-level error summary', () => {
    it('shows a role="alert" submission error summary after a failed transaction', async () => {
      const approveMilestone = jest
        .fn()
        .mockRejectedValue(new Error('Contract error'));
      const signAndSubmit = jest.fn();

      mockedUseValidator.mockReturnValue({
        isValidator: true,
        checking: false,
        approveMilestone,
        revokeMilestone: jest.fn(),
        loading: false,
        error: null,
      });
      mockedUseWallet.mockReturnValue({
        publicKey: 'GVALIDATORPUBLICKEY',
        isAuthenticated: true,
        isConnecting: false,
        connect: jest.fn(),
        disconnect: jest.fn(),
        signAndSubmit,
      } as any);

      render(<ApproveForm onSuccess={jest.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Enter player ID'), {
        target: { value: 'player-1' },
      });
      fireEvent.change(
        screen.getByPlaceholderText(/Describe the player's achievement/i),
        { target: { value: 'Test milestone' } },
      );
      fireEvent.change(
        screen.getByPlaceholderText('https://example.com/evidence'),
        { target: { value: 'https://example.com/evidence' } },
      );

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /Approve Milestone/i }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByRole('alert', { name: /submission error/i }),
        ).toBeInTheDocument();
      });
    });

    it('does not show submission error summary before a submission attempt', () => {
      renderComponent();
      expect(
        screen.queryByRole('alert', { name: /submission error/i }),
      ).toBeNull();
    });
  });

  describe('focus management', () => {
    it('moves focus to evidence URL input when URL is invalid on form submit', async () => {
      renderComponent();
      const urlInput = screen.getByPlaceholderText(
        'https://example.com/evidence',
      );
      fireEvent.change(urlInput, { target: { value: 'not-a-url' } });

      // Submit the form directly (keyboard Enter), bypassing the disabled button
      const form = urlInput.closest('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      expect(document.activeElement).toBe(urlInput);
    });

    it('moves focus to the error summary after a failed transaction', async () => {
      const approveMilestone = jest
        .fn()
        .mockRejectedValue(new Error('Contract error'));

      mockedUseValidator.mockReturnValue({
        isValidator: true,
        checking: false,
        approveMilestone,
        revokeMilestone: jest.fn(),
        loading: false,
        error: null,
      });
      mockedUseWallet.mockReturnValue({
        publicKey: 'GVALIDATORPUBLICKEY',
        isAuthenticated: true,
        isConnecting: false,
        connect: jest.fn(),
        disconnect: jest.fn(),
        signAndSubmit: jest.fn(),
      } as any);

      render(<ApproveForm onSuccess={jest.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Enter player ID'), {
        target: { value: 'player-1' },
      });
      fireEvent.change(
        screen.getByPlaceholderText(/Describe the player's achievement/i),
        { target: { value: 'Test milestone' } },
      );
      fireEvent.change(
        screen.getByPlaceholderText('https://example.com/evidence'),
        { target: { value: 'https://example.com/evidence' } },
      );

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /Approve Milestone/i }),
        );
      });

      const summary = await screen.findByRole('alert', {
        name: /submission error/i,
      });
      expect(document.activeElement).toBe(summary);
    });
  });
});
