/**
 * Web Push subscription API helpers (issue #1516, issue #558).
 *
 * The backend stores the PushSubscription and sends a Web Push message
 * (VAPID-signed) when a validator approves a milestone.
 */
import { backendClient as api } from './playersApi';

export const subscribeToPush = (
  wallet: string,
  subscription: PushSubscriptionJSON,
) => api.post('/push/subscriptions', { wallet, subscription });

export const unsubscribeFromPush = (wallet: string, endpoint: string) =>
  api.delete('/push/subscriptions', { data: { wallet, endpoint } });
