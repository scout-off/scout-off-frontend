import type { RecentlyViewedEntry } from './useRecentlyViewed';
import { fetchWithRetry } from '@/lib/fetchWithRetry';

/** Client for app/api/recently-viewed — same-origin, cookie-authenticated. */

export async function fetchRecentlyViewed(): Promise<RecentlyViewedEntry[]> {
  const res = await fetchWithRetry('/api/recently-viewed');
  if (!res.ok) throw new Error('Failed to fetch recently viewed');
  return res.json();
}

/**
 * Records a player view. Deliberately uses bare `fetch` (no retry) because
 * this is a best-effort analytics-style operation — a lost response doesn't
 * risk duplicate entries (the server deduplicates on scoutWallet+playerId).
 */
export async function recordView(
  playerId: string,
  viewedAt: number,
): Promise<RecentlyViewedEntry> {
  const res = await fetch('/api/recently-viewed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, viewedAt }),
  });
  if (!res.ok) throw new Error('Failed to record view');
  return res.json();
}

/**
 * Removes a recently viewed entry. Returns true if removed successfully.
 */
export async function removeView(id: number): Promise<void> {
  const res = await fetch('/api/recently-viewed', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error('Failed to remove view');
}