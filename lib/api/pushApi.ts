/**
 * Web Push subscription API helpers (issue #1516, issue #558, issue #1666).
 *
 * The backend stores the PushSubscription and sends a Web Push message
 * (VAPID-signed) when a validator approves a milestone.
 *
 * The wallet identity is derived from the SEP-10 session cookie on the
 * server (issue #1666); it is never trusted from the request body. The
 * `wallet` argument is kept for call-site compatibility but is not sent.
 */
import { backendClient as api } from './playersApi';

export const subscribeToPush = (
  _wallet: string,
  subscription: PushSubscriptionJSON,
) => api.post('/push/subscriptions', { subscription });

export const unsubscribeFromPush = (_wallet: string, endpoint: string) =>
  api.delete('/push/subscriptions', { data: { endpoint } });
