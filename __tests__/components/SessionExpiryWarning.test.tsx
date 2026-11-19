import { render, screen, act, fireEvent } from '@testing-library/react';
import SessionExpiryWarning from '@/components/SessionExpiryWarning';

const mockReauthenticate = jest.fn();
const mockShowToast = jest.fn();

let mockWallet: {
  isAuthenticated: boolean;
  sessionExpiresAt: number | null;
  reauthenticate: jest.Mock;
};

jest.mock('@/hooks/useWallet', () => ({
  useWallet: () => mockWallet,
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show: mockShowToast }),
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { minutes?: number }) =>
    values && values.minutes !== undefined ? `${key}:${values.minutes}` : key,
}));

jest.mock('@/components/ui/Modal', () => ({
  __esModule: true,
  default: ({
    isOpen,
    onClose,
    title,
    children,
  }: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <button type="button" onClick={onClose}>
          close
        </button>
        {children}
      </div>
    ) : null,
}));

jest.mock('@/components/ui/Spinner', () => ({
  __esModule: true,
  default: () => <span data-testid="spinner" />,
}));

const WARNING_BEFORE_MS = 2 * 60 * 1000;

describe('SessionExpiryWarning', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReauthenticate.mockReset();
    mockShowToast.mockReset();
    mockWallet = {
      isAuthenticated: true,
      sessionExpiresAt: Date.now() + 60 * 60 * 1000,
      reauthenticate: mockReauthenticate,
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not render the warning when the session has ample time left', () => {
    render(<SessionExpiryWarning />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the warning once the session is within the warning threshold', () => {
    mockWallet.sessionExpiresAt = Date.now() + WARNING_BEFORE_MS - 30 * 1000;
    render(<SessionExpiryWarning />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/expiringSoonMessage/)).toBeInTheDocument();
  });

  it('shows the warning when the threshold is reached via the timer', () => {
    mockWallet.sessionExpiresAt = Date.now() + WARNING_BEFORE_MS + 60 * 1000;
    render(<SessionExpiryWarning />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(60 * 1000);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not render when the user is not authenticated', () => {
    mockWallet.isAuthenticated = false;
    mockWallet.sessionExpiresAt = Date.now() + 30 * 1000;
    render(<SessionExpiryWarning />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reauthenticates and shows a success toast when the stay signed in action is clicked', async () => {
    mockReauthenticate.mockResolvedValue(undefined);
    mockWallet.sessionExpiresAt = Date.now() + 30 * 1000;
    render(<SessionExpiryWarning />);

    await act(async () => {
      fireEvent.click(screen.getByText('reauthenticate'));
    });

    expect(mockReauthenticate).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith({
      variant: 'success',
      message: 'renewedSuccess',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an error toast when reauthentication fails', async () => {
    mockReauthenticate.mockRejectedValue(new Error('nope'));
    mockWallet.sessionExpiresAt = Date.now() + 30 * 1000;
    render(<SessionExpiryWarning />);

    await act(async () => {
      fireEvent.click(screen.getByText('reauthenticate'));
    });

    expect(mockShowToast).toHaveBeenCalledWith({
      variant: 'error',
      message: 'renewFailed',
    });
  });

  it('dismisses the warning when the dismiss action is clicked', () => {
    mockWallet.sessionExpiresAt = Date.now() + 30 * 1000;
    render(<SessionExpiryWarning />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('dismiss'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
