/**
 * Unit tests for lib/notificationsClient.ts
 *
 * Strategy: mock global.fetch (which fetchWithRetry delegates to for the GET
 * call, and which is called directly for the POST call) and call the
 * exported functions directly — no renderHook, no SWR.
 */
import {
  fetchReadNotificationIds,
  markNotificationsRead,
} from '@/lib/notificationsClient';

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
});

// ── fetchReadNotificationIds ──────────────────────────────────────────────────

describe('fetchReadNotificationIds', () => {
  it('GETs /api/notifications/read and returns the ids array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ids: [1, 2, 3] }),
      headers: new Headers(),
    });

    const result = await fetchReadNotificationIds();

    // fetchWithRetry calls fetch(url, init) where init may be undefined
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/notifications/read',
      undefined,
    );
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns an empty array when the server returns an empty ids list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ids: [] }),
      headers: new Headers(),
    });

    const result = await fetchReadNotificationIds();

    expect(result).toEqual([]);
  });

  it('throws when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers(),
    });

    await expect(fetchReadNotificationIds()).rejects.toThrow(
      'Failed to fetch read notifications',
    );
  });

  it('propagates a network-level rejection', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    await expect(fetchReadNotificationIds()).rejects.toThrow('network down');
  });
});

// ── markNotificationsRead ─────────────────────────────────────────────────────

describe('markNotificationsRead', () => {
  it('POSTs the ids array as JSON to /api/notifications/read', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await markNotificationsRead([10, 20, 30]);

    expect(mockFetch).toHaveBeenCalledWith('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [10, 20, 30] }),
    });
  });

  it('is a no-op and makes no request when ids is empty', async () => {
    await markNotificationsRead([]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(markNotificationsRead([1])).rejects.toThrow(
      'Failed to mark notifications read',
    );
  });

  it('propagates a network-level rejection', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    await expect(markNotificationsRead([1])).rejects.toThrow('network error');
  });

  it('marks a single notification read', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await markNotificationsRead([42]);

    expect(mockFetch).toHaveBeenCalledWith('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [42] }),
    });
  });
});
