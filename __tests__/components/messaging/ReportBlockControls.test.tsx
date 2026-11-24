import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportBlockControls from '@/components/messaging/ReportBlockControls';
import { blockUser, reportUser, unblockUser } from '@/lib/messaging/moderation';
import { useBlockedUsers } from '@/hooks/useBlockedUsers';

jest.mock('@/lib/messaging/moderation', () => ({
  blockUser: jest.fn(),
  reportUser: jest.fn(),
  unblockUser: jest.fn(),
}));

jest.mock('@/hooks/useBlockedUsers', () => ({
  useBlockedUsers: jest.fn(),
}));

const mockBlockUser = blockUser as jest.MockedFunction<typeof blockUser>;
const mockReportUser = reportUser as jest.MockedFunction<typeof reportUser>;
const mockUnblockUser = unblockUser as jest.MockedFunction<typeof unblockUser>;
const mockUseBlockedUsers = useBlockedUsers as jest.MockedFunction<
  typeof useBlockedUsers
>;

const THREAD_ID = 'thread-1';
const COUNTERPART_ID = 'user-42';

function setupBlockedUsers({
  blocked = false,
  refetch = jest.fn().mockResolvedValue(undefined),
} = {}) {
  mockUseBlockedUsers.mockReturnValue({
    blockedIds: blocked ? new Set([COUNTERPART_ID]) : new Set(),
    isBlocked: (id: string) => (blocked ? id === COUNTERPART_ID : false),
    loading: false,
    error: null,
    refetch,
  });
  return refetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  setupBlockedUsers();
  mockBlockUser.mockResolvedValue(undefined);
  mockUnblockUser.mockResolvedValue(undefined);
  mockReportUser.mockResolvedValue(undefined);
});

describe('ReportBlockControls', () => {
  it('renders Report and Block controls when the user is not blocked', () => {
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    expect(screen.getByRole('button', { name: 'Report' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Block' })).toBeInTheDocument();
    expect(
      screen.queryByText('You have blocked this user.'),
    ).not.toBeInTheDocument();
  });

  it('renders the Unblock control and blocked notice when the server reports the user as already blocked', () => {
    setupBlockedUsers({ blocked: true });

    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    expect(screen.getByRole('button', { name: 'Unblock' })).toBeInTheDocument();
    expect(screen.getByText('You have blocked this user.')).toBeInTheDocument();
  });

  it('toggles the report form open and closed', async () => {
    const user = userEvent.setup();
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    expect(
      screen.queryByPlaceholderText('Reason for report…'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Report' }));
    expect(
      screen.getByPlaceholderText('Reason for report…'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Report' }));
    expect(
      screen.queryByPlaceholderText('Reason for report…'),
    ).not.toBeInTheDocument();
  });

  it('does not submit a report when the reason is blank', async () => {
    const user = userEvent.setup();
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Report' }));
    await user.click(screen.getByRole('button', { name: 'Submit report' }));

    expect(mockReportUser).not.toHaveBeenCalled();
    // The form should remain open since nothing was submitted.
    expect(
      screen.getByPlaceholderText('Reason for report…'),
    ).toBeInTheDocument();
  });

  it('submits a report with a trimmed reason and shows a status message', async () => {
    const user = userEvent.setup();
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Report' }));
    await user.type(
      screen.getByPlaceholderText('Reason for report…'),
      '  Spam messages  ',
    );
    await user.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => {
      expect(mockReportUser).toHaveBeenCalledWith(
        THREAD_ID,
        COUNTERPART_ID,
        'Spam messages',
      );
    });

    expect(
      screen.getByText(
        'Reported. Our moderation team will review this thread.',
      ),
    ).toBeInTheDocument();
    // The form closes and resets after a successful submit.
    expect(
      screen.queryByPlaceholderText('Reason for report…'),
    ).not.toBeInTheDocument();
  });

  it('blocks the user, shows a status message, and refetches the server block list', async () => {
    const refetch = setupBlockedUsers({ blocked: false });
    const user = userEvent.setup();
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Block' }));

    await waitFor(() => {
      expect(mockBlockUser).toHaveBeenCalledWith(COUNTERPART_ID);
    });

    expect(
      screen.getByText(
        'User blocked. They can no longer message or contact you.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('You have blocked this user.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unblock' })).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('unblocks the user, shows a status message, and refetches the server block list', async () => {
    const refetch = setupBlockedUsers({ blocked: true });
    const user = userEvent.setup();
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Unblock' }));

    await waitFor(() => {
      expect(mockUnblockUser).toHaveBeenCalledWith(COUNTERPART_ID);
    });

    expect(screen.getByText('User unblocked.')).toBeInTheDocument();
    expect(
      screen.queryByText('You have blocked this user.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Block' })).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows an error and reverts the optimistic state when the block request fails', async () => {
    setupBlockedUsers({ blocked: false });
    mockBlockUser.mockRejectedValue(new Error('network error'));
    const user = userEvent.setup();
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Block' }));

    await waitFor(() => {
      expect(
        screen.getByText('Could not block this user. Please try again.'),
      ).toBeInTheDocument();
    });

    // Reverts to the not-blocked state rather than leaving the optimistic
    // "blocked" UI permanently out of sync with the server.
    expect(screen.getByRole('button', { name: 'Block' })).toBeInTheDocument();
    expect(
      screen.queryByText('You have blocked this user.'),
    ).not.toBeInTheDocument();
  });

  it('shows an error and reverts the optimistic state when the unblock request fails', async () => {
    setupBlockedUsers({ blocked: true });
    mockUnblockUser.mockRejectedValue(new Error('network error'));
    const user = userEvent.setup();
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Unblock' }));

    await waitFor(() => {
      expect(
        screen.getByText('Could not unblock this user. Please try again.'),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Unblock' })).toBeInTheDocument();
    expect(screen.getByText('You have blocked this user.')).toBeInTheDocument();
  });
});
