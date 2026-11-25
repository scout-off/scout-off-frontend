/**
 * Saved-search alert job (issue #1705), run by /api/cron/saved-search-alerts.
 *
 * 1. Match: reads indexer events after the stored cursor; for every
 *    `player_registered` / `milestone_approved` event, loads the player and
 *    records an alert for each saved search it now matches (deduped per
 *    scout + search + player by the store). Only scouts with an active
 *    subscription and the `savedSearchMatches` preference enabled get alerts.
 *    The cursor is persisted after each page, so a failed run resumes.
 * 2. Deliver: hands pending alerts to the delivery channels — immediately
 *    for "instant" scouts, at most once every 24 h for "daily" digest scouts.
 */
import type { IndexedEvent, IndexedEventsPage } from './indexerClient';
import type { PlayerFilter, SavedSearch } from '@/types';
import {
  SavedSearchAlertStore,
  type SavedSearchAlert,
} from './savedSearchAlertStore';
import { SavedSearchStore } from './savedSearchStore';
import { NotificationPreferencesStore } from './notificationPreferencesStore';
import { matchesSavedSearch, type MatchablePlayer } from './savedSearchMatch';
import {
  SAVED_SEARCH_ALERT_CHANNELS,
  type SavedSearchAlertChannel,
} from './savedSearchAlertDelivery';

const TRIGGER_EVENTS = new Set<IndexedEvent['type']>([
  'player_registered',
  'milestone_approved',
]);
const DIGEST_INTERVAL_SEC = 24 * 60 * 60;

export interface SavedSearchAlertDeps {
  fetchEvents: (params: {
    after?: number;
    limit?: number;
  }) => Promise<IndexedEventsPage>;
  getPlayer: (playerId: string) => Promise<MatchablePlayer | null>;
  hasActiveSubscription: (wallet: string) => Promise<boolean>;
  channels?: SavedSearchAlertChannel[];
  /** Unix seconds. */
  now?: () => number;
}

export interface SavedSearchAlertRunResult {
  eventsProcessed: number;
  alertsRecorded: number;
  alertsDelivered: number;
  cursor: number;
}

export async function runSavedSearchAlerts(
  deps: SavedSearchAlertDeps,
  { pageSize = 100, maxPages = 10 } = {},
): Promise<SavedSearchAlertRunResult> {
  const store = SavedSearchAlertStore.getInstance();
  const prefs = NotificationPreferencesStore.getInstance();
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const searches = SavedSearchStore.getInstance().listAll();

  const subscriptionCache = new Map<string, Promise<boolean>>();
  const isEligible = (wallet: string) => {
    if (!prefs.getSavedSearchAlerts(wallet).enabled) {
      return Promise.resolve(false);
    }
    if (!subscriptionCache.has(wallet)) {
      subscriptionCache.set(
        wallet,
        deps.hasActiveSubscription(wallet).catch(() => false),
      );
    }
    return subscriptionCache.get(wallet)!;
  };

  let cursor = store.getCursor();
  let eventsProcessed = 0;
  let alertsRecorded = 0;

  for (let page = 0; page < maxPages; page++) {
    const { events, nextCursor } = await deps.fetchEvents({
      after: cursor,
      limit: pageSize,
    });
    const fresh = events
      .filter((e) => e.id > cursor)
      .sort((a, b) => a.id - b.id);
    if (fresh.length === 0) break;

    for (const event of fresh) {
      eventsProcessed++;
      if (!TRIGGER_EVENTS.has(event.type) || !event.playerId) continue;
      alertsRecorded += await recordMatches(
        event,
        event.playerId,
        searches,
        deps,
        isEligible,
      );
    }

    cursor = fresh[fresh.length - 1].id;
    store.setCursor(cursor);
    if (nextCursor === null) break;
  }

  const alertsDelivered = await deliverPending(
    deps.channels ?? SAVED_SEARCH_ALERT_CHANNELS,
    now(),
  );

  return { eventsProcessed, alertsRecorded, alertsDelivered, cursor };
}

async function recordMatches(
  event: IndexedEvent,
  playerId: string,
  searches: SavedSearch[],
  deps: SavedSearchAlertDeps,
  isEligible: (wallet: string) => Promise<boolean>,
): Promise<number> {
  const player = await deps.getPlayer(playerId);
  if (!player) return 0;

  const store = SavedSearchAlertStore.getInstance();
  let recorded = 0;
  for (const search of searches) {
    if (!matchesSavedSearch(player, search.filter)) continue;
    if (!(await isEligible(search.scoutWallet))) continue;
    const alert = store.record({
      scoutWallet: search.scoutWallet,
      searchId: search.id,
      searchName: search.name,
      playerId,
      eventId: event.id,
      filter: search.filter,
    });
    if (alert) recorded++;
  }
  return recorded;
}

async function deliverPending(
  channels: SavedSearchAlertChannel[],
  nowSec: number,
): Promise<number> {
  const store = SavedSearchAlertStore.getInstance();
  const prefs = NotificationPreferencesStore.getInstance();

  const byWallet = new Map<string, SavedSearchAlert[]>();
  for (const alert of store.listPending()) {
    const list = byWallet.get(alert.scoutWallet) ?? [];
    list.push(alert);
    byWallet.set(alert.scoutWallet, list);
  }

  let delivered = 0;
  for (const [wallet, alerts] of byWallet) {
    const { enabled, delivery } = prefs.getSavedSearchAlerts(wallet);
    if (!enabled) continue;
    const digest = delivery === 'daily';
    if (digest && nowSec - store.lastDigestAt(wallet) < DIGEST_INTERVAL_SEC) {
      continue;
    }
    for (const channel of channels) {
      await channel.deliver(wallet, alerts, { digest });
    }
    delivered += alerts.length;
  }
  return delivered;
}
