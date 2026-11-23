/**
 * Pure mapping from indexer events to notification-center entries (issue
 * #557). Kept separate from hooks/useNotifications.ts so the event → title/
 * message logic can be reasoned about (and reused server-side, e.g. for a
 * future push-notification producer) without pulling in SWR or the client.
 */
import type { IndexedEvent } from './indexerClient';
import type { Notification, NotificationPreferences } from '@/types';

/**
 * Derives this wallet's notifications from a page of indexer events.
 * - Player-relevant: `milestone_approved` events where the wallet is the
 *   approved player (playerId doubles as the player's own wallet for
 *   self-lookups elsewhere in the app, e.g. usePlayer(publicKey)).
 * - Scout-relevant: `player_contacted` events where the wallet is the
 *   paying scout.
 * `read` always starts `false` — callers overlay persisted read state.
 */
export function deriveNotifications(
  events: IndexedEvent[],
  wallet: string,
): Notification[] {
  const notifications: Notification[] = [];

  for (const event of events) {
    if (event.type === 'milestone_approved' && event.playerId === wallet) {
      const description =
        typeof event.data.description === 'string'
          ? event.data.description
          : 'A milestone';
      notifications.push({
        id: event.id,
        category: 'milestone_approval',
        title: 'Milestone approved',
        message: `${description} was approved.`,
        createdAt: event.timestamp,
        read: false,
        playerId: event.playerId,
      });
    } else if (event.type === 'player_contacted' && event.scout === wallet) {
      notifications.push({
        id: event.id,
        category: 'contact_unlock',
        title: 'Contact details unlocked',
        message: event.playerId
          ? `You unlocked contact details for player ${event.playerId}.`
          : 'You unlocked a player’s contact details.',
        createdAt: event.timestamp,
        read: false,
        playerId: event.playerId,
      });
    }
  }

  return notifications.sort((a, b) => b.createdAt - a.createdAt);
}

/** Filters derived notifications by the wallet's saved category preferences. */
export function applyNotificationPreferences(
  notifications: Notification[],
  preferences: NotificationPreferences,
): Notification[] {
  return notifications.filter((n) => {
    if (n.category === 'milestone_approval')
      return preferences.milestoneApprovals;
    if (n.category === 'contact_unlock') return preferences.contactUnlocks;
    return true;
  });
}
