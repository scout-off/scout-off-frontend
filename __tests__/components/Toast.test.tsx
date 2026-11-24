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
  const toast = useToast();

  useEffect(() => {
    toast.show({ message: 'Initial toast', variant: 'info' });
  }, [toast]);

  return (
    <div>
      <button
        onClick={() =>
          toast.show({ message: 'Success message', variant: 'success' })
        }
      >
        Show Success
      </button>
      <button
        onClick={() =>
          toast.show({ message: 'Error message', variant: 'error' })
        }
      >
        Show Error
      </button>
      <button
        onClick={() => toast.show({ message: 'Info message', variant: 'info' })}
      >
        Show Info
      </button>
      <button
        onClick={() =>
          toast.show({ message: 'Warning message', variant: 'warning' })
        }
      >
        Show Warning
      </button>
    </div>
  );
}

function UndoToastTestApp({ onUndo }: { onUndo: () => void }) {
  const toast = useToast();

  return (
    <button
      onClick={() =>
        toast.show({
          message: 'Removed from watchlist',
          variant: 'info',
          duration: 5000,
          action: { label: 'Undo', onClick: onUndo },
        })
      }
    >
      Remove
    </button>
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

  /**
   * Per Issue #28, error toasts use `role="alert"` and non-errors use
   * `role="status"`. The helper covers both so existing assertions keep
   * working without each test having to branch on the variant.
   */
  const queryAllToasts = () => [
    ...screen.queryAllByRole('alert'),
    ...screen.queryAllByRole('status'),
  ];

  it('renders a toast when show is called', () => {
    render(
      <ToastProvider>
        <ToastTestApp />
      </ToastProvider>,
    );

    const toasts = queryAllToasts();
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts[0].textContent).toContain('Initial toast');
  });

  it('renders variant-specific icon and border for success', () => {
    render(
      <ToastProvider>
        <ToastTestApp />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText(/show success/i));

    const successMessage = screen.getByText('Success message');
    expect(successMessage).toBeTruthy();
    const toast = queryAllToasts().find((node) =>
      node.textContent?.includes('Success message'),
    );
    expect(toast).toBeDefined();
    expect(toast?.className).toContain('border-brand-green');
    expect(toast?.textContent).toContain('✓');
  });

  it('uses role="alert" for error and warning toasts', () => {
    render(
      <ToastProvider>
        <ToastTestApp />
      </ToastProvider>,
    );

    // Trigger an error toast
    fireEvent.click(screen.getByText(/show error/i));
    const errorToast = screen
      .getAllByRole('alert')
      .find((node) => node.textContent?.includes('Error message'));
    expect(errorToast).toBeDefined();
    expect(errorToast).toHaveAttribute('role', 'alert');

    // Trigger a warning toast
    fireEvent.click(screen.getByText(/show warning/i));
    const warningToast = screen
      .getAllByRole('alert')
      .find((node) => node.textContent?.includes('Warning message'));
    expect(warningToast).toBeDefined();
    expect(warningToast).toHaveAttribute('role', 'alert');
  });

  it('uses role="status" for success and info toasts', () => {
    render(
      <ToastProvider>
        <ToastTestApp />
      </ToastProvider>,
    );

    // The initial toast is an info toast (role="status")
    const infoToast = screen
      .getAllByRole('status')
      .find((node) => node.textContent?.includes('Initial toast'));
    expect(infoToast).toBeDefined();
    expect(infoToast).toHaveAttribute('role', 'status');

    // Trigger a success toast
    fireEvent.click(screen.getByText(/show success/i));
    const successToast = screen
      .getAllByRole('status')
      .find((node) => node.textContent?.includes('Success message'));
    expect(successToast).toBeDefined();
    expect(successToast).toHaveAttribute('role', 'status');
  });

  it('close button is a <button> element with aria-label="Close notification"', () => {
    render(
      <ToastProvider>
        <ToastTestApp />
      </ToastProvider>,
    );

    const closeButton = screen.getByRole('button', {
      name: /close notification/i,
    });
    expect(closeButton.tagName).toBe('BUTTON');
    expect(closeButton).toHaveAttribute('aria-label', 'Close notification');
    expect(closeButton).toHaveAttribute('type', 'button');
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
      name: /close notification/i,
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

    const toastMessages = queryAllToasts().map(
      (element) => element.textContent ?? '',
    );

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

  it('stacks multiple toasts fired in quick succession and dismisses each independently', () => {
    render(
      <ToastProvider>
        <ToastTestApp />
      </ToastProvider>,
    );

    // Clear the initial toast so it doesn't interfere with the 3-toast cap.
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Initial toast')).toBeNull();

    fireEvent.click(screen.getByText(/show success/i));
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByText(/show error/i));
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByText(/show info/i));

    // All three toasts are visible simultaneously as distinct, stacked nodes
    // rather than overlapping/replacing one another.
    const toasts = queryAllToasts();
    expect(toasts).toHaveLength(3);

    const stack = toasts[0].parentElement;
    expect(stack).not.toBeNull();
    expect(stack?.className).toMatch(/flex-col/);
    expect(stack?.className).toMatch(/gap-3/);
    toasts.forEach((toast) => {
      expect(toast.parentElement).toBe(stack);
    });

    // Success (shown first) dismisses on its own timer without shifting
    // the still-active Error/Info toasts.
    act(() => {
      jest.advanceTimersByTime(1000); // t = 4000ms since Success shown
    });
    expect(screen.queryByText('Success message')).toBeNull();
    expect(screen.getByText('Error message')).toBeTruthy();
    expect(screen.getByText('Info message')).toBeTruthy();

    // Error dismisses next, independently of Info.
    act(() => {
      jest.advanceTimersByTime(1500); // t = 4000ms since Error shown
    });
    expect(screen.queryByText('Error message')).toBeNull();
    expect(screen.getByText('Info message')).toBeTruthy();

    // Info dismisses last, on its own schedule.
    act(() => {
      jest.advanceTimersByTime(1500); // t = 4000ms since Info shown
    });
    expect(screen.queryByText('Info message')).toBeNull();
  });

  it('renders an action button and invokes its onClick, dismissing the toast', () => {
    const onUndo = jest.fn();
    render(
      <ToastProvider>
        <UndoToastTestApp onUndo={onUndo} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Remove'));
    expect(screen.getByText('Removed from watchlist')).toBeTruthy();

    const undoButton = screen.getByRole('button', { name: 'Undo' });
    fireEvent.click(undoButton);

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Removed from watchlist')).toBeNull();
  });

  it('honors a custom duration instead of the 4s default', () => {
    const onUndo = jest.fn();
    render(
      <ToastProvider>
        <UndoToastTestApp onUndo={onUndo} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Remove'));

    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.getByText('Removed from watchlist')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Removed from watchlist')).toBeNull();
  });
});
