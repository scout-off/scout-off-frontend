import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { useAdminConfirm } from '@/components/admin/useAdminConfirm';

const show = jest.fn();
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show }),
}));

function Harness({
  run,
  onError,
}: {
  run: () => Promise<void>;
  onError?: (message: string) => void;
}) {
  const { confirm, dialog } = useAdminConfirm();
  return (
    <>
      <button
        onClick={() =>
          confirm({
            label: 'Remove validator',
            message: 'Are you sure?',
            run,
            onError,
          })
        }
      >
        Open
      </button>
      {dialog}
    </>
  );
}

const confirmButton = () =>
  screen.getByRole('button', { name: 'Remove validator' });

describe('useAdminConfirm', () => {
  beforeEach(() => show.mockClear());

  it('calls run once on confirm and closes the dialog', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    render(<Harness run={run} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    await userEvent.click(confirmButton());
    await waitFor(() =>
      expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument(),
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(show).not.toHaveBeenCalled();
  });

  it('never calls run on cancel', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    render(<Harness run={run} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() =>
      expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument(),
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('reports a readable error and resets when run rejects', async () => {
    const run = jest.fn().mockRejectedValue(new Error('network down'));
    const onError = jest.fn();
    render(<Harness run={run} onError={onError} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(confirmButton());
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    const message = onError.mock.calls[0][0];
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(0);
    expect(show).toHaveBeenCalledWith({ message, variant: 'error' });
    await waitFor(() =>
      expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument(),
    );
  });

  it('disables confirm while run is pending so a second click does not re-run', async () => {
    let resolve!: () => void;
    const run = jest.fn(() => new Promise<void>((r) => (resolve = r)));
    render(<Harness run={run} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(confirmButton());
    await waitFor(() => expect(confirmButton()).toBeDisabled());
    await userEvent.click(confirmButton());
    expect(run).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() =>
      expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument(),
    );
  });

  it('returns focus to the trigger after closing', async () => {
    render(<Harness run={jest.fn().mockResolvedValue(undefined)} />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
