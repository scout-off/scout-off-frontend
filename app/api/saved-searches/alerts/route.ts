import { NextRequest } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import { SavedSearchAlertStore } from '@/lib/savedSearchAlertStore';
import { alertsToNotifications } from '@/lib/savedSearchAlertNotifications';
import { createRequestLogger } from '@/lib/logger';
import { privateJson } from '@/lib/httpResponses';

export const runtime = 'nodejs';

/**
 * GET /api/saved-searches/alerts
 *
 * The authenticated scout's delivered saved-search match alerts, already
 * shaped as notification-center entries (issue #1705).
 */
export async function GET(req: NextRequest) {
  const wallet = getSessionWallet(req);
  if (!wallet) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }
  const log = createRequestLogger(req);
  try {
    const alerts = SavedSearchAlertStore.getInstance().listDelivered(wallet);
    return privateJson({ notifications: alertsToNotifications(alerts) });
  } catch (err) {
    log.error('Failed to load saved-search alerts', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson(
      { error: 'Failed to load saved-search alerts' },
      { status: 500 },
    );
  }
}
