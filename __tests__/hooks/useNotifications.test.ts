import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useNotifications, notificationsKey } from '@/hooks/useNotifications';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import type { IndexedEvent } from '@/lib/indexerClient';

const mockFetchEvents = jest.fn();
const mockFetchReadNotificationIds = jest.fn();
const mockMarkNotificationsRead = jest.fn();

jest.mock('@/lib/indexerClient', () => ({
  fetchEvents: (...args: unknown[]) => mockFetchEvents(...args),
}));

jest.mock('@/lib/notificationsClient', () => ({
  fetchReadNotificationIds: (...args: unknown[]) =>
    mockFetchReadNotificationIds(...args),
  markNotificationsRead: (...args: unknown[]) =>
    mockMarkNotificationsRead(...args),
}));

jest.mock('@/hooks/useNotificationPreferences', () => ({
  useNotificationPreferences: jest.fn(),
}));

const mockedUseNotificationPreferences =
  useNotificationPreferences as jest.MockedFunction<
    typeof useNotificationPreferences
  >;

const WALLET = 'GWALLETADDRESS';

function makeEvent(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: 1,
    type: 'milestone_approved',
    playerId: WALLET,
    scout: null,
    validator: 'GVALIDATOR',
    ledger: 1,
    timestamp: 1700000000,
    data: { description: 'Scored a hat-trick' },
    ...over,
  };
}

// Fresh, unshared SWR cache per test so results are deterministic.
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

function allowAllPreferences() {
  mockedUseNotificationPreferences.mockReturnValue({
    preferences: { milestoneApprovals: true, contactUnlocks: true },
    loading: false,
    error: null,
    update: jest.fn(),
  });
}

describe('notificationsKey', () => {
  it('returns null when there is no wallet', () => {
    expect(notificationsKey(null)).toBeNull();
  });

  it('returns a wallet-scoped cache key', () => {
    expect(notificationsKey(WALLET)).toBe(`notifications:${WALLET}`);
  });
});

describe('useNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    allowAllPreferences();
    mockFetchReadNotificationIds.mockResolvedValue([]);
  });

  it('does not fetch events when there is no wallet', async () => {
    const { result } = renderHook(() => useNotifications(null), { wrapper });
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    expect(mockFetchReadNotificationIds).not.toHaveBeenCalled();
  });

  it('loads and derives notifications for the given wallet', async () => {
    mockFetchEvents.mockResolvedValueOnce({
      events: [
        makeEvent({ id: 1, type: 'milestone_approved', playerId: WALLET }),
        makeEvent({
          id: 2,
          type: 'player_contacted',
          scout: WALLET,
          playerId: 'player-2',
        }),
      ],
      nextCursor: null,
    });

    const { result } = renderHook(() => useNotifications(WALLET), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.unreadCount).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('marks notifications as read using the persisted read-id set', async () => {
    mockFetchEvents.mockResolvedValueOnce({
      events: [makeEvent({ id: 5, playerId: WALLET })],
      nextCursor: null,
    });
    mockFetchReadNotificationIds.mockResolvedValueOnce([5]);

    const { result } = renderHook(() => useNotifications(WALLET), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.notifications[0].read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it('filters out notification categories disabled via preferences', async () => {
    mockedUseNotificationPreferences.mockReturnValue({
      preferences: { milestoneApprovals: false, contactUnlocks: true },
      loading: false,
      error: null,
      update: jest.fn(),
    });
    mockFetchEvents.mockResolvedValueOnce({
      events: [
        makeEvent({ id: 1, type: 'milestone_approved', playerId: WALLET }),
        makeEvent({
          id: 2,
          type: 'player_contacted',
          scout: WALLET,
          playerId: 'player-2',
        }),
      ],
      nextCursor: null,
    });

    const { result } = renderHook(() => useNotifications(WALLET), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].category).toBe('contact_unlock');
  });

  it('paginates through multiple pages of events until nextCursor is null', async () => {
    mockFetchEvents
      .mockResolvedValueOnce({
        events: [makeEvent({ id: 1, playerId: WALLET })],
        nextCursor: 50,
      })
      .mockResolvedValueOnce({
        events: [makeEvent({ id: 2, playerId: WALLET })],
        nextCursor: null,
      });

    const { result } = renderHook(() => useNotifications(WALLET), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchEvents).toHaveBeenCalledTimes(2);
    expect(mockFetchEvents).toHaveBeenNthCalledWith(1, {
      limit: 200,
      before: undefined,
    });
    expect(mockFetchEvents).toHaveBeenNthCalledWith(2, {
      limit: 200,
      before: 50,
    });
    expect(result.current.notifications).toHaveLength(2);
  });

  it('stops paginating once an empty batch is returned even with a non-null cursor', async () => {
    mockFetchEvents.mockResolvedValueOnce({ events: [], nextCursor: 5 });

    const { result } = renderHook(() => useNotifications(WALLET), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchEvents).toHaveBeenCalledTimes(1);
  });

  it('caps pagination at 10 pages', async () => {
    mockFetchEvents.mockResolvedValue({
      events: [makeEvent({ id: 1, playerId: WALLET })],
      nextCursor: 1,
    });

    const { result } = renderHook(() => useNotifications(WALLET), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchEvents).toHaveBeenCalledTimes(10);
  });

  it('surfaces the error message when the fetch rejects with an Error', async () => {
    mockFetchEvents.mockRejectedValue(new Error('indexer unreachable'));

    const { result } = renderHook(() => useNotifications(WALLET), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('indexer unreachable');
    expect(result.current.notifications).toEqual([]);
  });

  // ── markRead ─────────────────────────────────────────────────────────

  it('optimistically marks a single notification read and persists it', async () => {
    mockFetchEvents.mockResolvedValueOnce({
      events: [makeEvent({ id: 9, playerId: WALLET })],
      nextCursor: null,
    });
    mockFetchReadNotificationIds
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([9]);
    mockMarkNotificationsRead.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNotifications(WALLET), {
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notifications[0].read).toBe(false);

    await act(async () => {
      await result.current.markRead(9);
    });

    expect(mockMarkNotificationsRead).toHaveBeenCalledWith([9]);
    await waitFor(() =>
      expect(result.current.notifications[0].read).toBe(true),
    );
  });

  it('re-revalidates after markRead even if the API call fails', async () => {
    mockFetchEvents.mockResolvedValue({
      events: [makeEvent({ id: 9, playerId: WALLET })],
      nextCursor: null,
    });
    mockMarkNotificationsRead.mockRejectedValueOnce(new Error('network'));
    mockFetchReadNotificationIds
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([9]);

    const { result } = renderHook(() => useNotifications(WALLET), {
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.markRead(9)).rejects.toThrow('network');
    });

    // mutate() (revalidate) re-invoked fetchReadNotificationIds after the failed write.
    await waitFor(() => expect(mockFetchReadNotificationIds).toHaveBeenCalledTimes(2));
  });

  // ── markAllRead ──────────────────────────────────────────────────────

  it('does nothing when there are no unread notifications', async () => {
    mockFetchEvents.mockResolvedValueOnce({
      events: [makeEvent({ id: 9, playerId: WALLET })],
      nextCursor: null,
    });
    mockFetchReadNotificationIds.mockResolvedValueOnce([9]);

    const { result } = renderHook(() => useNotifications(WALLET), {
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unreadCount).toBe(0);

    await act(async () => {
      await result.current.markAllRead();
    });

    expect(mockMarkNotificationsRead).not.toHaveBeenCalled();
  });

  it('marks all unread notifications read at once', async () => {
    mockFetchEvents.mockResolvedValue({
      events: [
        makeEvent({ id: 1, playerId: WALLET }),
        makeEvent({
          id: 2,
          type: 'player_contacted',
          scout: WALLET,
          playerId: 'player-2',
        }),
      ],
      nextCursor: null,
    });
    // First load: nothing marked read on the server yet. After markAllRead's
    // background revalidate, the server has caught up (simulates the write
    // having actually persisted).
    mockFetchReadNotificationIds
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([1, 2]);
    mockMarkNotificationsRead.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNotifications(WALLET), {
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unreadCount).toBe(2);

    await act(async () => {
      await result.current.markAllRead();
    });

    expect(mockMarkNotificationsRead).toHaveBeenCalledWith([1, 2]);
    await waitFor(() => expect(result.current.unreadCount).toBe(0));
  });

  it('re-revalidates after markAllRead even if the API call fails', async () => {
    mockFetchEvents.mockResolvedValue({
      events: [makeEvent({ id: 1, playerId: WALLET })],
      nextCursor: null,
    });
    mockMarkNotificationsRead.mockRejectedValueOnce(new Error('network'));
    mockFetchReadNotificationIds
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([1]);

    const { result } = renderHook(() => useNotifications(WALLET), {
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.markAllRead()).rejects.toThrow('network');
    });

    await waitFor(() =>
      expect(mockFetchReadNotificationIds).toHaveBeenCalledTimes(2),
    );
  });
});
