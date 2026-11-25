import type { WatchlistEntry } from '@/types';
import { fetchWithRetry, fetchWithTimeout } from '@/lib/fetchWithRetry';
import * as api from '@/lib/generated/apiClient';

/**
 * Client for app/api/watchlist — same-origin, cookie-authenticated. Thin
 * wrapper over the generated client (lib/generated/apiClient.ts, #1708).
 */

/** Keeps this client's historical error messages for non-2xx responses. */
function failWith(message: string) {
  return (err: unknown): never => {
    if (err instanceof api.ApiError) throw new Error(message);
    throw err;
  };
}

export async function fetchWatchlist(): Promise<WatchlistEntry[]> {
  return api
    .getWatchlist({ fetcher: fetchWithRetry })
    .catch(failWith('Failed to fetch watchlist'));
}

// addToWatchlist/removeFromWatchlist deliberately use fetchWithTimeout rather
// than fetchWithRetry: these are mutations with no idempotency key, so an
// automatic retry after a lost response risks a duplicate watchlist entry.
// fetchWithTimeout adds a 10 s deadline so the UI never hangs indefinitely
// on a flaky mobile connection (issue #1508).
export async function addToWatchlist(
  playerId: string,
): Promise<WatchlistEntry> {
  return api
    .addToWatchlist(playerId, { fetcher: fetchWithTimeout })
    .catch(failWith('Failed to add to watchlist'));
}

export async function removeFromWatchlist(id: number): Promise<void> {
  await api
    .removeFromWatchlist(id, { fetcher: fetchWithTimeout })
    .catch(failWith('Failed to remove from watchlist'));
}
