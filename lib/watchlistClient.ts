import type { WatchlistEntry } from '@/types';
import { fetchWithRetry } from '@/lib/fetchWithRetry';

/** Client for app/api/watchlist — same-origin, cookie-authenticated. */

export async function fetchWatchlist(): Promise<WatchlistEntry[]> {
  const res = await fetchWithRetry('/api/watchlist');
  if (!res.ok) throw new Error('Failed to fetch watchlist');
  return res.json();
}

// addToWatchlist/removeFromWatchlist deliberately use a bare `fetch`, not
// `fetchWithRetry`: these are mutations with no idempotency key, so an
// automatic retry after a lost response risks e.g. a duplicate watchlist
// entry.
export async function addToWatchlist(
  playerId: string,
): Promise<WatchlistEntry> {
  const res = await fetch('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId }),
  });
  if (!res.ok) throw new Error('Failed to add to watchlist');
  return res.json();
}

export async function removeFromWatchlist(id: number): Promise<void> {
  const res = await fetch('/api/watchlist', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error('Failed to remove from watchlist');
}
