/** Client for app/api/notifications/read — same-origin, cookie-authenticated. */
import { fetchWithRetry } from '@/lib/fetchWithRetry';

export async function fetchReadNotificationIds(): Promise<number[]> {
  const res = await fetchWithRetry('/api/notifications/read');
  if (!res.ok) throw new Error('Failed to fetch read notifications');
  const { ids } = await res.json();
  return ids as number[];
}

// Deliberately a bare `fetch`, not `fetchWithRetry`: a POST with no
// idempotency key, though marking already-read ids read again is a no-op
// server-side, so the double-submit risk here is low.
export async function markNotificationsRead(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const res = await fetch('/api/notifications/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('Failed to mark notifications read');
}
