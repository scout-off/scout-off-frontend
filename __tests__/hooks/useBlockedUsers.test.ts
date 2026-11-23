import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useBlockedUsers } from '@/hooks/useBlockedUsers';

const mockFetchBlockedUsers = jest.fn();
const mockGetBlockedUsers = jest.fn();

jest.mock('@/lib/messaging/moderation', () => ({
  fetchBlockedUsers: (...args: unknown[]) => mockFetchBlockedUsers(...args),
  getBlockedUsers: (...args: unknown[]) => mockGetBlockedUsers(...args),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

describe('useBlockedUsers', () => {
  beforeEach(() => {
    mockFetchBlockedUsers.mockReset();
    mockGetBlockedUsers.mockReset();
    mockGetBlockedUsers.mockReturnValue([]);
  });

  it('reflects a server-reported block even when localStorage said unblocked', async () => {
    mockGetBlockedUsers.mockReturnValue([]); // local cache says nothing is blocked
    mockFetchBlockedUsers.mockResolvedValue([
      { userId: 'user-2', blockedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const { result } = renderHook(() => useBlockedUsers(), { wrapper });

    expect(result.current.isBlocked('user-2')).toBe(false);

    await waitFor(() => expect(result.current.isBlocked('user-2')).toBe(true));
  });

  it('does not leave a stale "not blocked" state when the local cache was corrupted/cleared', async () => {
    // getBlockedUsers() already resets to [] on a parse error, so the seed
    // is empty regardless — the important part is the server fetch still
    // resolves to the correct, non-stale state.
    mockGetBlockedUsers.mockReturnValue([]);
    mockFetchBlockedUsers.mockResolvedValue([
      { userId: 'user-3', blockedAt: '2026-01-02T00:00:00.000Z' },
    ]);

    const { result } = renderHook(() => useBlockedUsers(), { wrapper });

    await waitFor(() => expect(result.current.isBlocked('user-3')).toBe(true));
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error and keeps the last-known blocked state when the server fetch fails', async () => {
    mockGetBlockedUsers.mockReturnValue([
      { userId: 'user-5', blockedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    mockFetchBlockedUsers.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useBlockedUsers(), { wrapper });

    await waitFor(() => expect(result.current.error).toBe('network error'));
    // Falls back to the local cache rather than dropping the known block.
    expect(result.current.isBlocked('user-5')).toBe(true);
  });

  it('refetch() re-fetches from the server', async () => {
    mockFetchBlockedUsers.mockResolvedValue([]);

    const { result } = renderHook(() => useBlockedUsers(), { wrapper });
    await waitFor(() => expect(mockFetchBlockedUsers).toHaveBeenCalledTimes(1));

    mockFetchBlockedUsers.mockResolvedValue([
      { userId: 'user-7', blockedAt: '2026-01-03T00:00:00.000Z' },
    ]);
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.isBlocked('user-7')).toBe(true));
    expect(mockFetchBlockedUsers).toHaveBeenCalledTimes(2);
  });
});
