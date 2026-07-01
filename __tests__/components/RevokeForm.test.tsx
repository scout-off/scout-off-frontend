import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RevokeForm from '@/components/validator/RevokeForm';
import { buildRevokeMilestone } from '@/lib/contract';
import { useWallet } from '@/hooks/useWallet';

// Mock dependencies
jest.mock('@/lib/contract');
jest.mock('@/hooks/useWallet');
jest.mock('@/hooks/useValidator', () => ({
  useValidator: jest.fn().mockReturnValue({
    isValidator: false,
    checking: false,
    approveMilestone: jest.fn(),
    revokeMilestone: jest.fn(),
    loading: false,
    error: null,
  }),
}));
jest.mock('@/hooks/useIsPaused', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue(false),
}));
jest.mock('@/components/ui/ConfirmDialog', () => {
  return function MockConfirmDialog({
    isOpen,
    onConfirm,
    onCancel,
    message,
  }: any) {
    if (!isOpen) return null;
    return (
      <div data-testid="confirm-dialog">
        {message && <p>{message}</p>}
        <button onClick={onConfirm} data-testid="confirm-btn">
          Confirm
        </button>
        <button onClick={onCancel} data-testid="cancel-btn">
          Cancel
        </button>
      </div>
    );
  };
});

describe('RevokeForm', () => {
  const mockSignAndSubmit = jest.fn();
  const mockOnSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useWallet as jest.Mock).mockReturnValue({
      publicKey: 'GTESTPUBLICKEY123456789',
      signAndSubmit: mockSignAndSubmit,
    });
    (buildRevokeMilestone as jest.Mock).mockResolvedValue('mock-xdr');
  });

  it('renders player ID and milestone ID input fields', () => {
    render(<RevokeForm onSuccess={mockOnSuccess} />);

    expect(screen.getByLabelText(/player id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/milestone id/i)).toBeInTheDocument();
  });

  it('shows validation errors if fields are empty on submit', async () => {
    render(<RevokeForm onSuccess={mockOnSuccess} />);

    const submitButton = screen.getByRole('button', {
      name: /revoke milestone/i,
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/player id is required/i)).toBeInTheDocument();
      expect(screen.getByText(/milestone id is required/i)).toBeInTheDocument();
    });
  });

  it('disables submit button during transaction submission', async () => {
    (buildRevokeMilestone as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve('mock-xdr'), 100)),
    );

    render(<RevokeForm onSuccess={mockOnSuccess} />);

    const playerInput = screen.getByLabelText(/player id/i);
    const milestoneInput = screen.getByLabelText(/milestone id/i);
    const submitButton = screen.getByRole('button', {
      name: /revoke milestone/i,
    });

    fireEvent.change(playerInput, { target: { value: 'player123' } });
    fireEvent.change(milestoneInput, { target: { value: 'milestone456' } });
    fireEvent.click(submitButton);

    // Click confirm in dialog
    const confirmBtn = await screen.findByTestId('confirm-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(submitButton).toBeDisabled();
      expect(screen.getByText(/revoking/i)).toBeInTheDocument();
    });

    await waitFor(
      () => {
        expect(submitButton).not.toBeDisabled();
      },
      { timeout: 200 },
    );
  });

  it('calls onSuccess after a successful revoke', async () => {
    render(<RevokeForm onSuccess={mockOnSuccess} />);

    const playerInput = screen.getByLabelText(/player id/i);
    const milestoneInput = screen.getByLabelText(/milestone id/i);
    const submitButton = screen.getByRole('button', {
      name: /revoke milestone/i,
    });

    fireEvent.change(playerInput, { target: { value: 'player123' } });
    fireEvent.change(milestoneInput, { target: { value: 'milestone456' } });
    fireEvent.click(submitButton);

    const confirmBtn = await screen.findByTestId('confirm-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockSignAndSubmit).toHaveBeenCalledWith('mock-xdr');
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('shows error message when the contract call fails', async () => {
    (buildRevokeMilestone as jest.Mock).mockRejectedValue(
      new Error('UnauthorizedValidator'),
    );

    render(<RevokeForm onSuccess={mockOnSuccess} />);

    const playerInput = screen.getByLabelText(/player id/i);
    const milestoneInput = screen.getByLabelText(/milestone id/i);
    const submitButton = screen.getByRole('button', {
      name: /revoke milestone/i,
    });

    fireEvent.change(playerInput, { target: { value: 'player123' } });
    fireEvent.change(milestoneInput, { target: { value: 'milestone456' } });
    fireEvent.click(submitButton);

    const confirmBtn = await screen.findByTestId('confirm-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/you are not authorised as a validator/i),
      ).toBeInTheDocument();
    });
  });

  it('shows a ConfirmDialog before submitting', async () => {
    render(<RevokeForm onSuccess={mockOnSuccess} />);

    const playerInput = screen.getByLabelText(/player id/i);
    const milestoneInput = screen.getByLabelText(/milestone id/i);
    const submitButton = screen.getByRole('button', {
      name: /revoke milestone/i,
    });

    fireEvent.change(playerInput, { target: { value: 'player123' } });
    fireEvent.change(milestoneInput, { target: { value: 'milestone456' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      expect(screen.getByText(/revoke milestone/i)).toBeInTheDocument();
      expect(
        screen.getByText(/are you sure you want to revoke/i),
      ).toBeInTheDocument();
    });
  });

  it('closes ConfirmDialog when cancel is clicked', async () => {
    render(<RevokeForm onSuccess={mockOnSuccess} />);

    const playerInput = screen.getByLabelText(/player id/i);
    const milestoneInput = screen.getByLabelText(/milestone id/i);
    const submitButton = screen.getByRole('button', {
      name: /revoke milestone/i,
    });

    fireEvent.change(playerInput, { target: { value: 'player123' } });
    fireEvent.change(milestoneInput, { target: { value: 'milestone456' } });
    fireEvent.click(submitButton);

    const confirmBtn = await screen.findByTestId('confirm-btn');
    const cancelBtn = screen.getByTestId('cancel-btn');

    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    });
  });
});
