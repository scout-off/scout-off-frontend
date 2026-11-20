/**
 * Maps delivered saved-search alerts to notification-center entries (issue
 * #1705). Instant alerts become one notification each; a daily digest
 * (alerts sharing one `deliveredAt`) becomes a single summary notification.
 *
 * Ids are negative so they never collide with indexer event ids, which the
 * read-state store (notificationReadStore) also keys on.
 */
import type { Notification } from '@/types';
import type { SavedSearchAlert } from './savedSearchAlertStore';
import { savedSearchDashboardHref } from './savedSearchMatch';

export function alertsToNotifications(
  alerts: SavedSearchAlert[],
): Omit<Notification, 'read'>[] {
  const notifications: Omit<Notification, 'read'>[] = [];
  const digests = new Map<number, SavedSearchAlert[]>();

  for (const alert of alerts) {
    if (alert.deliveredAt === null) continue;
    if (alert.digest) {
      const batch = digests.get(alert.deliveredAt) ?? [];
      batch.push(alert);
      digests.set(alert.deliveredAt, batch);
      continue;
    }
    notifications.push({
      id: -alert.id,
      category: 'saved_search_match',
      title: 'New player matches your saved search',
      message: `Player ${alert.playerId} matches "${alert.searchName}".`,
      createdAt: alert.deliveredAt,
      playerId: alert.playerId,
      href: savedSearchDashboardHref(alert.filter),
    });
  }

  for (const [deliveredAt, batch] of digests) {
    const searchNames = [...new Set(batch.map((a) => a.searchName))];
    notifications.push({
      id: -Math.min(...batch.map((a) => a.id)),
      category: 'saved_search_match',
      title: 'Daily saved-search digest',
      message: `${batch.length} new player${batch.length === 1 ? '' : 's'} match ${searchNames.map((n) => `"${n}"`).join(', ')}.`,
      createdAt: deliveredAt,
      playerId: null,
      href:
        searchNames.length === 1
          ? savedSearchDashboardHref(batch[0].filter)
          : '/scout',
    });
  }

  return notifications.sort((a, b) => b.createdAt - a.createdAt);
}
