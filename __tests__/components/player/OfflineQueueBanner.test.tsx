import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OfflineQueueBanner from '@/components/player/OfflineQueueBanner';
import type { FailedAction } from '@/lib/offlineQueue';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const messages: Record<string, string> = {
      queued: `${values?.count} action(s) queued — will submit when back online`,
      queued_desc:
        'Your changes have been saved locally and will be submitted automatically when your connection is restored.',
      processing: `Submitting ${values?.count} action(s)…`,
      processing_desc:
        'Please wait while your queued changes are being submitted.',
      retry: 'Retry now',
      retry_aria: 'Retry queued actions',
      failed: `${values?.count} action(s) could not be submitted`,
      failed_desc:
        'The following actions failed permanently and will not be retried automatically. You can discard them to clear the error.',
      failed_action_label: `${values?.type} action (attempted ${values?.retryCount} time(s))`,
      discard_aria: `Discard failed action: ${values?.type}`,
      discard_all: 'Discard all failed',
      conflict_action_label: `${values?.type} action — changed elsewhere`,
      conflict_desc:
        'This was changed elsewhere before your queued update could be sent.',
      conflict_discard_aria: `Discard conflicting action: ${values?.type}`,
    };
    return messages[key] ?? key;
  },
}));

const onRetry = jest.fn();
const onDiscardFailed = jest.fn();
const onDiscardAllFailed = jest.fn();

function makeFailedAction(overrides: Partial<FailedAction> = {}): FailedAction {
  return {
    id: 'action-1',
    queuedAt: 0,
    retryCount: 3,
    type: 'update_profile',
    payload: {},
    failedAt: 0,
    lastError: 'Server rejected the request',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('OfflineQueueBanner', () => {
  it('renders nothing when the queue is empty and there are no failed actions', () => {
    const { container } = render(
      <OfflineQueueBanner
        pendingCount={0}
        isProcessing={false}
        onRetry={onRetry}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a pending-count message when items are queued', () => {
    render(
      <OfflineQueueBanner
        pendingCount={3}
        isProcessing={false}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(
      screen.getByText('3 action(s) queued — will submit when back online'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry queued actions' }),
    ).toBeInTheDocument();
  });

  it('calls onRetry when the retry button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <OfflineQueueBanner
        pendingCount={2}
        isProcessing={false}
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Retry queued actions' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows a processing state without a retry button while isProcessing is true', () => {
    render(
      <OfflineQueueBanner
        pendingCount={2}
        isProcessing
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Submitting 2 action(s)…')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry queued actions' }),
    ).not.toBeInTheDocument();
  });

  it('shows a failed-actions banner and discards a single action', async () => {
    const user = userEvent.setup();
    render(
      <OfflineQueueBanner
        pendingCount={0}
        isProcessing={false}
        onRetry={onRetry}
        failedActions={[makeFailedAction()]}
        onDiscardFailed={onDiscardFailed}
        onDiscardAllFailed={onDiscardAllFailed}
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText('1 action(s) could not be submitted'),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Discard failed action: update_profile',
      }),
    );

    expect(onDiscardFailed).toHaveBeenCalledWith('action-1');
  });

  it('shows a "discard all" action only when there is more than one failed action', async () => {
    const user = userEvent.setup();
    render(
      <OfflineQueueBanner
        pendingCount={0}
        isProcessing={false}
        onRetry={onRetry}
        failedActions={[
          makeFailedAction({ id: 'action-1' }),
          makeFailedAction({ id: 'action-2' }),
        ]}
        onDiscardFailed={onDiscardFailed}
        onDiscardAllFailed={onDiscardAllFailed}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Discard all failed' }));

    expect(onDiscardAllFailed).toHaveBeenCalledTimes(1);
  });

  it('renders conflict-specific copy for conflicted failed actions', () => {
    render(
      <OfflineQueueBanner
        pendingCount={0}
        isProcessing={false}
        onRetry={onRetry}
        failedActions={[makeFailedAction({ conflict: true })]}
      />,
    );

    expect(
      screen.getByText('update_profile action — changed elsewhere'),
    ).toBeInTheDocument();
  });

  it('renders both the pending and failed banners together', () => {
    render(
      <OfflineQueueBanner
        pendingCount={1}
        isProcessing={false}
        onRetry={onRetry}
        failedActions={[makeFailedAction()]}
      />,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
