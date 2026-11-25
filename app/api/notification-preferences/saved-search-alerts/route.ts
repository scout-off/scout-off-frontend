import { NextRequest } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import { NotificationPreferencesStore } from '@/lib/notificationPreferencesStore';
import { createRequestLogger } from '@/lib/logger';
import { privateJson } from '@/lib/httpResponses';

export const runtime = 'nodejs';

/**
 * GET /api/notification-preferences/saved-search-alerts
 *
 * The authenticated scout's `saved_search_matches` preference (issue #1705):
 * `{ enabled: boolean, delivery: 'instant' | 'daily' }`, defaulting to
 * enabled + instant.
 */
export async function GET(req: NextRequest) {
  const wallet = getSessionWallet(req);
  if (!wallet) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }
  const log = createRequestLogger(req);
  try {
    return privateJson(
      NotificationPreferencesStore.getInstance().getSavedSearchAlerts(wallet),
    );
  } catch (err) {
    log.error('Failed to load saved-search alert preferences', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson(
      { error: 'Failed to load saved-search alert preferences' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/notification-preferences/saved-search-alerts
 *
 * Body: { enabled: boolean, delivery: 'instant' | 'daily' }.
 */
export async function PUT(req: NextRequest) {
  const wallet = getSessionWallet(req);
  if (!wallet) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { enabled, delivery } = body as Record<string, unknown>;
  if (
    typeof enabled !== 'boolean' ||
    (delivery !== 'instant' && delivery !== 'daily')
  ) {
    return privateJson(
      {
        error:
          "enabled must be a boolean and delivery must be 'instant' or 'daily'",
      },
      { status: 400 },
    );
  }

  const log = createRequestLogger(req);
  try {
    return privateJson(
      NotificationPreferencesStore.getInstance().setSavedSearchAlerts(wallet, {
        enabled,
        delivery,
      }),
    );
  } catch (err) {
    log.error('Failed to save saved-search alert preferences', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson(
      { error: 'Failed to save saved-search alert preferences' },
      { status: 500 },
    );
  }
}
