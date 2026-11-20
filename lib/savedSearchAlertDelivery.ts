/**
 * Delivery channels for saved-search alerts (issue #1705). The in-app
 * channel marks alerts delivered so they appear in the notification center
 * (GET /api/saved-searches/alerts). Further channels (e.g. Web Push) can be
 * appended to SAVED_SEARCH_ALERT_CHANNELS without touching the cron.
 */
import {
  SavedSearchAlertStore,
  type SavedSearchAlert,
} from './savedSearchAlertStore';

export interface SavedSearchAlertChannel {
  name: string;
  deliver(
    wallet: string,
    alerts: SavedSearchAlert[],
    opts: { digest: boolean },
  ): Promise<void>;
}

export const inAppAlertChannel: SavedSearchAlertChannel = {
  name: 'in-app',
  async deliver(_wallet, alerts, { digest }) {
    SavedSearchAlertStore.getInstance().markDelivered(
      alerts.map((a) => a.id),
      digest,
    );
  },
};

export const SAVED_SEARCH_ALERT_CHANNELS: SavedSearchAlertChannel[] = [
  inAppAlertChannel,
];
