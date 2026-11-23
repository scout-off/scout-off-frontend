import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionMismatchWarning from '@/components/SessionMismatchWarning';
import { useWallet } from '@/hooks/useWallet';

jest.mock('@/hooks/useWallet', () => ({ useWallet: jest.fn() }));

const mockUseWallet = useWallet as jest.Mock;

function setup(overrides: Record<string, unknown> = {}) {
  const reauthenticate = jest.fn().mockResolvedValue(undefined);
  mockUseWallet.mockReturnValue({
    publicKey: 'GABCDEFGHIJKLMNOP',
    sessionMismatch: true,
    reauthenticate,
    ...overrides,
  });
  render(<SessionMismatchWarning />);
  return { reauthenticate };
}

describe('SessionMismatchWarning', () => {
  beforeEach(() => mockUseWallet.mockReset());

  it('renders the warning text and a re-authenticate action', () => {
    setup();
    expect(screen.getByText('Session mismatch detected')).toBeInTheDocument();
    expect(screen.getByText(/GABCDEFG…/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Re-authenticate' }),
    ).toBeInTheDocument();
  });

  it('exposes an alert role', () => {
    setup();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Session mismatch detected',
    );
  });

  it('calls reauthenticate when the action is clicked', async () => {
    const { reauthenticate } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Re-authenticate' }));
    expect(reauthenticate).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Re-authenticate' }),
      ).toBeEnabled(),
    );
  });

  it('renders nothing without a mismatch', () => {
    setup({ sessionMismatch: false });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides when dismissed', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss warning' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
