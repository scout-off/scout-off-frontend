import type { WatchlistEntry } from '@/types';
import {
  fetchWithRetry,
  fetchWithTimeout,
} from '@/lib/fetchWithRetry';

/** Client for app/api/watchlist — same-origin, cookie-authenticated. */

export async function fetchWatchlist(): Promise<WatchlistEntry[]> {
  const res = await fetchWithRetry('/api/watchlist');
  if (!res.ok) throw new Error('Failed to fetch watchlist');
  return res.json();
}

// addToWatchlist/removeFromWatchlist deliberately use fetchWithTimeout rather
// than fetchWithRetry: these are mutations with no idempotency key, so an
// automatic retry after a lost response risks a duplicate watchlist entry.
// fetchWithTimeout adds a 10 s deadline so the UI never hangs indefinitely
// on a flaky mobile connection (issue #1508).
export async function addToWatchlist(
  playerId: string,
): Promise<WatchlistEntry> {
  const res = await fetchWithTimeout('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId }),
  });
  if (!res.ok) throw new Error('Failed to add to watchlist');
  return res.json();
}

export async function removeFromWatchlist(id: number): Promise<void> {
  const res = await fetchWithTimeout('/api/watchlist', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error('Failed to remove from watchlist');
}
