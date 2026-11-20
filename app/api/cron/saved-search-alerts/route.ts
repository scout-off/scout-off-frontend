import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/httpResponses';
import { verifyCronRequest } from '@/lib/cronAuth';
import { createRequestLogger } from '@/lib/logger';
import { fetchEvents } from '@/lib/indexerClient';
import { getPlayer, getSubscription } from '@/lib/contract';
import { runSavedSearchAlerts } from '@/lib/savedSearchAlertsRunner';
import type { Player, Subscription } from '@/types';

export const runtime = 'nodejs';

/**
 * Saved-search alert job (issue #1705) — see lib/savedSearchAlertsRunner.ts.
 * Authorized like the other cron routes: `Authorization: Bearer ${CRON_SECRET}`.
 * Resumable: the indexer event cursor is persisted after every page.
 */
export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  const log = createRequestLogger(req);
  try {
    const result = await runSavedSearchAlerts({
      fetchEvents,
      getPlayer: async (playerId) =>
        ((await getPlayer(playerId)) as Player | null) ?? null,
      hasActiveSubscription: async (wallet) => {
        const sub = (await getSubscription(wallet)) as Subscription | null;
        return !!sub && sub.expiresAt > Date.now() / 1000;
      },
    });
    log.info('saved-search alerts completed', { ...result });
    return privateJson({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('saved-search alerts failed', { error: message });
    return privateJson(
      { error: 'Saved-search alert job failed', detail: message },
      { status: 500 },
    );
  }
}
