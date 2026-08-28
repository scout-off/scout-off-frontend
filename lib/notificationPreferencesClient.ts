/** Client for app/api/notification-preferences — same-origin, cookie-authenticated. */
import type { NotificationPreferences } from '@/types';
import { registerHandler, OfflineQueueConflictError } from '@/lib/offlineQueue';
import { fetchWithRetry } from '@/lib/fetchWithRetry';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  milestoneApprovals: true,
  contactUnlocks: true,
};

/** The offline-queue action type for a queued preferences update — see `registerHandler` call below. */
export const UPDATE_NOTIFICATION_PREFERENCES_ACTION =
  'update_notification_preferences';

/** Parses the `ETag` response header (the row's `updated_at`) into a version number, if present and well-formed. */
function versionFromEtag(res: Response): number | undefined {
  const etag = res.headers.get('ETag');
  if (etag === null) return undefined;
  const version = Number(etag);
  return Number.isFinite(version) ? version : undefined;
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await fetchWithRetry('/api/notification-preferences');
  if (!res.ok) throw new Error('Failed to fetch notification preferences');
  return res.json();
}

/**
 * Like `fetchNotificationPreferences`, but also returns the row's current
 * version so the caller can pass it back as `baseVersion` on a later
 * `updateNotificationPreferencesWithVersion` call (directly, or via a
 * queued offline action's `baseVersion`) — see issue #1178.
 */
export async function fetchNotificationPreferencesWithVersion(): Promise<{
  preferences: NotificationPreferences;
  version?: number;
}> {
  const res = await fetchWithRetry('/api/notification-preferences');
  if (!res.ok) throw new Error('Failed to fetch notification preferences');
  const preferences = await res.json();
  return { preferences, version: versionFromEtag(res) };
}

export async function updateNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  const res = await fetch('/api/notification-preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  });
  if (!res.ok) throw new Error('Failed to update notification preferences');
  return res.json();
}

/**
 * Like `updateNotificationPreferences`, but passes `baseVersion` along so
 * the server can detect a conflict (the row changed elsewhere since
 * `baseVersion` was read) and reject with 409 instead of silently
 * overwriting it. On a 409, throws `OfflineQueueConflictError` carrying the
 * server's current value/version — the same error type a queued action's
 * handler throws, so this function can be called directly or used as the
 * body of one (see `registerHandler` call below). See issue #1178.
 */
export async function updateNotificationPreferencesWithVersion(
  preferences: NotificationPreferences,
  baseVersion: number | undefined,
): Promise<{ preferences: NotificationPreferences; version?: number }> {
  const res = await fetch('/api/notification-preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...preferences, baseVersion }),
  });

  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    throw new OfflineQueueConflictError(
      'Notification preferences were changed elsewhere',
      { serverVersion: body.currentVersion, serverPayload: body.current },
    );
  }
  if (!res.ok) throw new Error('Failed to update notification preferences');

  const updated = await res.json();
  return { preferences: updated, version: versionFromEtag(res) };
}

/**
 * Registers the offline-queue handler for `update_notification_preferences`
 * actions (issue #1178). When a `useOfflineQueue().enqueue(
 * UPDATE_NOTIFICATION_PREFERENCES_ACTION, { preferences }, { baseVersion })`
 * call flushes, this runs the versioned PUT above; a 409 conflict surfaces
 * through the queue's normal dead-letter/conflict handling rather than
 * silently applying a stale write.
 */
registerHandler(UPDATE_NOTIFICATION_PREFERENCES_ACTION, async (action) => {
  const { preferences } = action.payload as {
    preferences: NotificationPreferences;
  };
  await updateNotificationPreferencesWithVersion(
    preferences,
    action.baseVersion,
  );
});
