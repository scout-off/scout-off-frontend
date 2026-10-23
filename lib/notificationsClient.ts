/** Client for app/api/notifications/read — same-origin, cookie-authenticated. */
import {
  fetchWithRetry,
  fetchWithTimeout,
} from '@/lib/fetchWithRetry';

export async function fetchReadNotificationIds(): Promise<number[]> {
  const res = await fetchWithRetry('/api/notifications/read');
  if (!res.ok) throw new Error('Failed to fetch read notifications');
  const { ids } = await res.json();
  return ids as number[];
}

// Deliberately fetchWithTimeout (single-shot, no retry): a POST with no
// idempotency key, though marking already-read ids read again is a no-op
// server-side, so the double-submit risk here is low. fetchWithTimeout adds
// a 10 s deadline so the UI never hangs indefinitely on a flaky mobile
// connection (issue #1508).
export async function markNotificationsRead(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const res = await fetchWithTimeout('/api/notifications/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('Failed to mark notifications read');
}
