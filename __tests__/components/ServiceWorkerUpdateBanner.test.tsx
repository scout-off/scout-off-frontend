import { render, screen, fireEvent, act } from '@testing-library/react';
import ServiceWorkerUpdateBanner from '@/components/ServiceWorkerUpdateBanner';
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate';

jest.mock('@/hooks/useServiceWorkerUpdate', () => ({
  useServiceWorkerUpdate: jest.fn(),
}));

const mockUseServiceWorkerUpdate = useServiceWorkerUpdate as jest.Mock;

describe('ServiceWorkerUpdateBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders nothing when no update is available', () => {
    mockUseServiceWorkerUpdate.mockReturnValue({
      updateAvailable: false,
      reload: jest.fn(),
      dismiss: jest.fn(),
    });

    const { container } = render(<ServiceWorkerUpdateBanner />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('renders the new-version banner with Reload and Dismiss actions', () => {
    mockUseServiceWorkerUpdate.mockReturnValue({
      updateAvailable: true,
      reload: jest.fn(),
      dismiss: jest.fn(),
    });

    render(<ServiceWorkerUpdateBanner />);

    const banner = screen.getByRole('status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText(/new version available/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^reload$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /dismiss update banner/i }),
    ).toBeInTheDocument();
  });

  test('Reload button calls the reload() from the hook', () => {
    const reload = jest.fn();
    mockUseServiceWorkerUpdate.mockReturnValue({
      updateAvailable: true,
      reload,
      dismiss: jest.fn(),
    });

    render(<ServiceWorkerUpdateBanner />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^reload$/i }));
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('Dismiss button calls dismiss() from the hook', () => {
    const dismiss = jest.fn();
    mockUseServiceWorkerUpdate.mockReturnValue({
      updateAvailable: true,
      reload: jest.fn(),
      dismiss,
    });

    render(<ServiceWorkerUpdateBanner />);

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /dismiss update banner/i }),
      );
    });

    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  test('does not render the Reload/Dismiss actions when updateAvailable flips false', () => {
    mockUseServiceWorkerUpdate.mockReturnValue({
      updateAvailable: true,
      reload: jest.fn(),
      dismiss: jest.fn(),
    });

    const { rerender, container } = render(<ServiceWorkerUpdateBanner />);
    expect(screen.getByRole('status')).toBeInTheDocument();

    mockUseServiceWorkerUpdate.mockReturnValue({
      updateAvailable: false,
      reload: jest.fn(),
      dismiss: jest.fn(),
    });
    rerender(<ServiceWorkerUpdateBanner />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
