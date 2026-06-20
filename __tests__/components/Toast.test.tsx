import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { useEffect } from 'react';
import { ToastProvider, useToast } from '@/components/ui/Toast';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

function ToastTestApp() {
  const { show } = useToast();

  useEffect(() => {
    show({ message: 'Initial toast', variant: 'info' });
  }, [show]);

  return (
    <div>
      <button
        onClick={() => show({ message: 'Success message', variant: 'success' })}
      >
        Show Success
      </button>
      <button
        onClick={() => show({ message: 'Error message', variant: 'error' })}
      >
        Show Error
      </button>
      <button
        onClick={() => show({ message: 'Info message', variant: 'info' })}
      >
        Show Info
      </button>
      <button
        onClick={() => show({ message: 'Warning message', variant: 'warning' })}
      >
        Show Warning
      </button>
    </div>
  );
}

describe('Toast notifications', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders a toast when show is called', () => {
    render(
      <ToastProvider>
        <ToastTestApp />
      </ToastProvider>,
    );

    const toasts = screen.getAllByTestId('toast');
    expect(toasts.some((t) => t.textContent?.includes('Initial toast'))).toBe(
      true,
    );
  });

  it('renders variant-specific icon and border for success', () => {
    render(
      <ToastProvider>
        <ToastTestApp />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText(/show success/i));

    const toast = screen
      .getAllByTestId('toast')
      .find((node) => node.textContent?.includes('Success message'));
    expect(toast).toBeDefined();
    expect(toast?.className).toContain('border-brand-green');
    expect(toast?.textContent).toContain('✓');
  });

  it('automatically dismisses a toast after 4 seconds', () => {
    render(
      <ToastProvider>
        <ToastTestApp />
      </ToastProvider>,
    );

    expect(screen.getByText('Initial toast')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(screen.queryByText('Initial toast')).toBeNull();
  });

  it('removes a toast immediately when the close button is clicked', () => {
    render(
      <ToastProvider>
        <ToastTestApp />
      </ToastProvider>,
    );

    const closeButton = screen.getByRole('button', {
      name: /dismiss notification/i,
    });
    fireEvent.click(closeButton);

    expect(screen.queryByText('Initial toast')).toBeNull();
  });

  it('limits visible toasts to a maximum of 3 items', () => {
    render(
      <ToastProvider>
        <ToastTestApp />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText(/show success/i));
    fireEvent.click(screen.getByText(/show error/i));
    fireEvent.click(screen.getByText(/show info/i));
    fireEvent.click(screen.getByText(/show warning/i));

    const toastMessages = screen
      .queryAllByTestId('toast')
      .map((element) => element.textContent ?? '');

    expect(toastMessages).toHaveLength(3);
    expect(toastMessages.some((text) => text.includes('Initial toast'))).toBe(
      false,
    );
    expect(toastMessages.some((text) => text.includes('Success message'))).toBe(
      false,
    );
    expect(toastMessages.some((text) => text.includes('Warning message'))).toBe(
      true,
    );
    expect(toastMessages.some((text) => text.includes('Error message'))).toBe(
      true,
    );
    expect(toastMessages.some((text) => text.includes('Info message'))).toBe(
      true,
    );
  });

  describe('ARIA live region attributes', () => {
    it('polite live region container has aria-live="polite" and aria-atomic="true"', () => {
      const { container } = render(
        <ToastProvider>
          <ToastTestApp />
        </ToastProvider>,
      );

      const politeRegion = container.querySelector('[aria-live="polite"]');
      expect(politeRegion).not.toBeNull();
      expect(politeRegion?.getAttribute('aria-atomic')).toBe('true');
    });

    it('assertive live region container has aria-live="assertive" and aria-atomic="true"', () => {
      const { container } = render(
        <ToastProvider>
          <ToastTestApp />
        </ToastProvider>,
      );

      const assertiveRegion = container.querySelector('[aria-live="assertive"]');
      expect(assertiveRegion).not.toBeNull();
      expect(assertiveRegion?.getAttribute('aria-atomic')).toBe('true');
    });

    it('error toasts appear inside the assertive live region', () => {
      const { container } = render(
        <ToastProvider>
          <ToastTestApp />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByText(/show error/i));

      const assertiveRegion = container.querySelector('[aria-live="assertive"]');
      expect(assertiveRegion?.textContent).toContain('Error message');
    });

    it('non-error toasts appear inside the polite live region', () => {
      const { container } = render(
        <ToastProvider>
          <ToastTestApp />
        </ToastProvider>,
      );

      // info toast from useEffect
      const politeRegion = container.querySelector('[aria-live="polite"]');
      expect(politeRegion?.textContent).toContain('Initial toast');

      fireEvent.click(screen.getByText(/show success/i));
      expect(politeRegion?.textContent).toContain('Success message');

      fireEvent.click(screen.getByText(/show warning/i));
      expect(politeRegion?.textContent).toContain('Warning message');
    });

    it('both live region containers are always present in the DOM', () => {
      const { container } = render(
        <ToastProvider>
          <div />
        </ToastProvider>,
      );

      expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
      expect(container.querySelector('[aria-live="assertive"]')).not.toBeNull();
    });
  });
});
