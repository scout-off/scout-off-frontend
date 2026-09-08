import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActiveSessions from '@/components/ActiveSessions';

const mockDisconnect = jest.fn();
let walletState: { isAuthenticated: boolean; disconnect: () => void };
jest.mock('@/hooks/useWallet', () => ({
  useWallet: () => walletState,
}));

const mockShow = jest.fn();
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show: mockShow }),
}));

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    deviceLabel: 'Chrome on macOS',
    createdAt: 1_700_000_000_000,
    lastSeenAt: 1_700_000_100_000,
    isCurrent: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  walletState = { isAuthenticated: true, disconnect: mockDisconnect };
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ActiveSessions', () => {
  it('prompts to connect when unauthenticated', () => {
    walletState = { isAuthenticated: false, disconnect: mockDisconnect };
    render(<ActiveSessions />);
    expect(
      screen.getByText('Connect your wallet to view active sessions.'),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('loads and lists sessions, tagging the current device', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessions: [
          session({ id: 'a', isCurrent: true, deviceLabel: 'This browser' }),
          session({ id: 'b', deviceLabel: 'Firefox on Linux' }),
        ],
      }),
    });

    render(<ActiveSessions />);
    expect(screen.getByText('Loading sessions…')).toBeInTheDocument();

    expect(await screen.findByText('This browser')).toBeInTheDocument();
    expect(screen.getByText('Firefox on Linux')).toBeInTheDocument();
    expect(screen.getByText('This device')).toBeInTheDocument();
  });

  it('renders an error state when the request fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    render(<ActiveSessions />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to load active sessions.',
    );
  });

  it('renders the empty state when there are no sessions', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessions: [] }),
    });

    render(<ActiveSessions />);

    expect(
      await screen.findByText('No active sessions found.'),
    ).toBeInTheDocument();
  });

  it('revokes a non-current session and drops it from the list', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessions: [
            session({ id: 'keep' }),
            session({ id: 'drop', deviceLabel: 'Old iPad' }),
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    render(<ActiveSessions />);
    const row = (await screen.findByText('Old iPad')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Revoke' }));

    await waitFor(() =>
      expect(screen.queryByText('Old iPad')).not.toBeInTheDocument(),
    );
    expect(global.fetch).toHaveBeenLastCalledWith('/api/auth/sessions/drop', {
      method: 'DELETE',
    });
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Session revoked',
        variant: 'success',
      }),
    );
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('confirms, then logs out, when revoking the current session', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessions: [session({ id: 'me', isCurrent: true })],
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    render(<ActiveSessions />);
    await screen.findByText('Chrome on macOS');
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(mockDisconnect).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalled();
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Session revoked — you have been logged out',
      }),
    );
  });

  it('aborts revoking the current session when the confirm is dismissed', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessions: [session({ id: 'me', isCurrent: true })],
      }),
    });

    render(<ActiveSessions />);
    await screen.findByText('Chrome on macOS');
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    // Only the initial load fetch happened — no DELETE.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('shows an error toast when the revoke request fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [session()] }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    render(<ActiveSessions />);
    await screen.findByText('Chrome on macOS');
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to revoke session',
          variant: 'error',
        }),
      ),
    );
  });
});
