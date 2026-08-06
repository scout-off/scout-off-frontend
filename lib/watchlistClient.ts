import type { WatchlistEntry } from '@/types';

/** Client for app/api/watchlist — same-origin, cookie-authenticated. */

export async function fetchWatchlist(): Promise<WatchlistEntry[]> {
  const res = await fetch('/api/watchlist');
  if (!res.ok) throw new Error('Failed to fetch watchlist');
  return res.json();
}

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
