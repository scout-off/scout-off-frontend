import type { RecentlyViewedEntry } from '@/types';
import { fetchWithRetry, fetchWithTimeout } from '@/lib/fetchWithRetry';
import * as api from '@/lib/generated/apiClient';

/**
 * Client for app/api/recently-viewed — same-origin, cookie-authenticated.
 * Thin wrapper over the generated client (lib/generated/apiClient.ts, #1708).
 */

/** Keeps this client's historical error messages for non-2xx responses. */
function failWith(message: string) {
  return (err: unknown): never => {
    if (err instanceof api.ApiError) throw new Error(message);
    throw err;
  };
}

export async function fetchRecentlyViewed(): Promise<RecentlyViewedEntry[]> {
  return api
    .getRecentlyViewed({ fetcher: fetchWithRetry })
    .catch(failWith('Failed to fetch recently viewed'));
}

/**
 * Records a player view. Uses fetchWithTimeout (no retry) because this is a
 * best-effort analytics-style operation — a lost response doesn't risk
 * duplicate entries (the server deduplicates on scoutWallet+playerId). A
 * 10 s deadline is enforced so the UI never hangs indefinitely on a flaky
 * mobile connection (issue #1508).
 */
export async function recordView(
  playerId: string,
  viewedAt: number,
): Promise<RecentlyViewedEntry> {
  return api
    .recordRecentlyViewed(playerId, viewedAt, { fetcher: fetchWithTimeout })
    .catch(failWith('Failed to record view'));
}

/**
 * Removes a recently viewed entry. Returns true if removed successfully.
 */
export async function removeView(id: number): Promise<void> {
  await api
    .removeRecentlyViewed(id, { fetcher: fetchWithTimeout })
    .catch(failWith('Failed to remove view'));
}
