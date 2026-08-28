/**
 * Unit tests for lib/notificationPreferencesClient.ts
 *
 * Strategy: mock global.fetch (which fetchWithRetry delegates to for the GET
 * calls, and which is called directly for PUT calls) and mock
 * lib/offlineQueue so the top-level registerHandler() call at module load
 * does not attempt to open IndexedDB in jsdom.
 */

// Prevent the module-level registerHandler() call from opening IndexedDB.
jest.mock('@/lib/offlineQueue', () => ({
  registerHandler: jest.fn(),
  OfflineQueueConflictError: class OfflineQueueConflictError extends Error {
    serverVersion?: number;
    serverPayload?: unknown;
    constructor(
      message: string,
      extra?: { serverVersion?: number; serverPayload?: unknown },
    ) {
      super(message);
      this.name = 'OfflineQueueConflictError';
      if (extra) {
        this.serverVersion = extra.serverVersion;
        this.serverPayload = extra.serverPayload;
      }
    }
  },
}));

import {
  fetchNotificationPreferences,
  fetchNotificationPreferencesWithVersion,
  updateNotificationPreferences,
  updateNotificationPreferencesWithVersion,
  DEFAULT_NOTIFICATION_PREFERENCES,
  UPDATE_NOTIFICATION_PREFERENCES_ACTION,
} from '@/lib/notificationPreferencesClient';
import { OfflineQueueConflictError } from '@/lib/offlineQueue';

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
});

const PREFS = { milestoneApprovals: true, contactUnlocks: false };

// ── Constants ─────────────────────────────────────────────────────────────────

describe('exported constants', () => {
  it('DEFAULT_NOTIFICATION_PREFERENCES has both toggles enabled', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
      milestoneApprovals: true,
      contactUnlocks: true,
    });
  });

  it('UPDATE_NOTIFICATION_PREFERENCES_ACTION is a non-empty string', () => {
    expect(typeof UPDATE_NOTIFICATION_PREFERENCES_ACTION).toBe('string');
    expect(UPDATE_NOTIFICATION_PREFERENCES_ACTION.length).toBeGreaterThan(0);
  });
});

// ── fetchNotificationPreferences ──────────────────────────────────────────────

describe('fetchNotificationPreferences', () => {
  it('GETs /api/notification-preferences and returns the parsed body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => PREFS,
      headers: new Headers(),
    });

    const result = await fetchNotificationPreferences();

    // fetchWithRetry calls fetch(url, init) where init may be undefined
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/notification-preferences',
      undefined,
    );
    expect(result).toEqual(PREFS);
  });

  it('throws when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers(),
    });

    await expect(fetchNotificationPreferences()).rejects.toThrow(
      'Failed to fetch notification preferences',
    );
  });

  it('propagates a network-level rejection', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    await expect(fetchNotificationPreferences()).rejects.toThrow('network down');
  });
});

// ── fetchNotificationPreferencesWithVersion ───────────────────────────────────

describe('fetchNotificationPreferencesWithVersion', () => {
  it('returns preferences and version parsed from the ETag header', async () => {
    const headers = new Headers({ ETag: '1700000000' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => PREFS,
      headers,
    });

    const result = await fetchNotificationPreferencesWithVersion();

    expect(result.preferences).toEqual(PREFS);
    expect(result.version).toBe(1700000000);
  });

  it('returns version: undefined when no ETag header is present', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => PREFS,
      headers: new Headers(),
    });

    const result = await fetchNotificationPreferencesWithVersion();

    expect(result.preferences).toEqual(PREFS);
    expect(result.version).toBeUndefined();
  });

  it('returns version: undefined when the ETag is not a finite number', async () => {
    const headers = new Headers({ ETag: 'not-a-number' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => PREFS,
      headers,
    });

    const result = await fetchNotificationPreferencesWithVersion();

    expect(result.version).toBeUndefined();
  });

  it('throws when the response is not ok', async () => {
    // 500 is a retryable status — every retry attempt needs to see the same
    // failure so fetchWithRetry exhausts its retries and surfaces the error.
    // Fake timers skip real backoff delays.
    jest.useFakeTimers();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
    });

    const assertion = expect(
      fetchNotificationPreferencesWithVersion(),
    ).rejects.toThrow('Failed to fetch notification preferences');
    await jest.runAllTimersAsync();
    await assertion;
    jest.useRealTimers();
  });
});

// ── updateNotificationPreferences ────────────────────────────────────────────

describe('updateNotificationPreferences', () => {
  it('PUTs preferences as JSON and returns the updated body', async () => {
    const updated = { milestoneApprovals: false, contactUnlocks: true };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => updated,
    });

    const result = await updateNotificationPreferences(PREFS);

    expect(mockFetch).toHaveBeenCalledWith('/api/notification-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(PREFS),
    });
    expect(result).toEqual(updated);
  });

  it('throws when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    await expect(updateNotificationPreferences(PREFS)).rejects.toThrow(
      'Failed to update notification preferences',
    );
  });

  it('propagates a network-level rejection', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    await expect(updateNotificationPreferences(PREFS)).rejects.toThrow(
      'network error',
    );
  });
});

// ── updateNotificationPreferencesWithVersion ──────────────────────────────────

describe('updateNotificationPreferencesWithVersion', () => {
  it('PUTs preferences with baseVersion in the body', async () => {
    const updated = { milestoneApprovals: true, contactUnlocks: true };
    const headers = new Headers({ ETag: '1700000001' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => updated,
      headers,
    });

    const result = await updateNotificationPreferencesWithVersion(PREFS, 1700000000);

    expect(mockFetch).toHaveBeenCalledWith('/api/notification-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...PREFS, baseVersion: 1700000000 }),
    });
    expect(result.preferences).toEqual(updated);
    expect(result.version).toBe(1700000001);
  });

  it('accepts undefined baseVersion', async () => {
    const headers = new Headers();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => PREFS,
      headers,
    });

    const result = await updateNotificationPreferencesWithVersion(PREFS, undefined);

    expect(result.preferences).toEqual(PREFS);
    expect(result.version).toBeUndefined();
  });

  it('throws OfflineQueueConflictError on a 409 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        currentVersion: 1700000002,
        current: { milestoneApprovals: false, contactUnlocks: false },
      }),
    });

    await expect(
      updateNotificationPreferencesWithVersion(PREFS, 1700000000),
    ).rejects.toThrow('Notification preferences were changed elsewhere');
  });

  it('propagates a conflict error as OfflineQueueConflictError', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        currentVersion: 99,
        current: { milestoneApprovals: false, contactUnlocks: false },
      }),
    });

    const error = await updateNotificationPreferencesWithVersion(
      PREFS,
      1,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(OfflineQueueConflictError);
    expect((error as InstanceType<typeof OfflineQueueConflictError>).serverVersion).toBe(99);
  });

  it('throws on a non-409 error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(
      updateNotificationPreferencesWithVersion(PREFS, 1),
    ).rejects.toThrow('Failed to update notification preferences');
  });
});
