import { NextRequest } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import {
  NotificationPreferencesStore,
  PreferencesConflictError,
} from '@/lib/notificationPreferencesStore';
import { createRequestLogger } from '@/lib/logger';
import { privateJson } from '@/lib/httpResponses';

export const runtime = 'nodejs';

/**
 * GET /api/notification-preferences
 *
 * Returns the authenticated wallet's notification category preferences,
 * defaulting to all-enabled if none have been saved yet. The response body
 * shape is unchanged for backwards compatibility; the row's version
 * (`updated_at`) is carried in the `ETag` header for callers that want to
 * round-trip it as `baseVersion` on a subsequent PUT — see issue #1178.
 */
export async function GET(req: NextRequest) {
  const wallet = getSessionWallet(req);
  if (!wallet) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  try {
    const { preferences, updatedAt } =
      NotificationPreferencesStore.getInstance().getWithVersion(wallet);
    return privateJson(preferences, {
      headers: { ETag: String(updatedAt) },
    });
  } catch (err) {
    log.error('Failed to load notification preferences', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson(
      { error: 'Failed to load notification preferences' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/notification-preferences
 *
 * Updates the authenticated wallet's notification category preferences.
 * Body: { milestoneApprovals: boolean, contactUnlocks: boolean, baseVersion?: number }.
 *
 * `baseVersion` is optional and enables optimistic-concurrency conflict
 * detection (issue #1178): pass the `updated_at` version the caller last
 * read (e.g. from the `ETag` header on a prior GET, or a queued offline
 * action's `baseVersion`). If the stored row has since been updated by a
 * different write — most commonly another browser tab or device flushing
 * its own queued change — the row's current `updated_at` will no longer
 * match, and this request is rejected with 409 instead of silently
 * overwriting that other write. Callers that omit `baseVersion` skip the
 * check entirely (the original, pre-#1178 behaviour) — there is no added
 * latency or round trip for the common single-tab case.
 */
export async function PUT(req: NextRequest) {
  const wallet = getSessionWallet(req);
  if (!wallet) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { milestoneApprovals, contactUnlocks, baseVersion } = body as Record<
    string,
    unknown
  >;
  if (
    typeof milestoneApprovals !== 'boolean' ||
    typeof contactUnlocks !== 'boolean'
  ) {
    return privateJson(
      {
        error: 'milestoneApprovals and contactUnlocks must both be booleans',
      },
      { status: 400 },
    );
  }
  if (baseVersion !== undefined && typeof baseVersion !== 'number') {
    return privateJson(
      { error: 'baseVersion must be a number when provided' },
      { status: 400 },
    );
  }

  try {
    const { preferences, updatedAt } =
      NotificationPreferencesStore.getInstance().setWithVersionCheck(
        wallet,
        { milestoneApprovals, contactUnlocks },
        baseVersion,
      );
    return privateJson(preferences, {
      headers: { ETag: String(updatedAt) },
    });
  } catch (err) {
    if (err instanceof PreferencesConflictError) {
      return privateJson(
        {
          error: 'conflict',
          message:
            'Notification preferences were changed elsewhere since you last loaded them.',
          current: err.current,
          currentVersion: err.currentVersion,
        },
        { status: 409, headers: { ETag: String(err.currentVersion) } },
      );
    }
    log.error('Failed to update notification preferences', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson(
      { error: 'Failed to update notification preferences' },
      { status: 500 },
    );
  }
}
