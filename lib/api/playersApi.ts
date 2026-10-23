/**
 * Player-domain API helpers (issue #1516).
 *
 * All calls go through the shared axios client (`lib/httpClient.ts`) against
 * the external backend, except `searchPlayersByName` which is routed through
 * the same-origin /api/players/search proxy so per-IP rate limiting applies.
 */
import { createClient, BACKEND_READ_TIMEOUT_MS, BACKEND_WRITE_TIMEOUT_MS } from '../httpClient';
import type { Player } from '@/types';
import { fetchWithRetry } from '../fetchWithRetry';

const api = createClient('backend', {
  timeoutMs: BACKEND_READ_TIMEOUT_MS,
  writeTimeoutMs: BACKEND_WRITE_TIMEOUT_MS,
  baseURL:
    process.env.API_URL_INTERNAL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:4000',
  headers: { 'Content-Type': 'application/json' },
});

export { api as backendClient };

/**
 * Thrown when the player search proxy (app/api/players/search/route.ts)
 * rate-limits the caller. `retryAfterSec` mirrors the response's
 * Retry-After header so callers can back off appropriately.
 */
export class SearchRateLimitedError extends Error {
  retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super('Too many search requests. Please slow down.');
    this.name = 'SearchRateLimitedError';
    this.retryAfterSec = retryAfterSec;
  }
}

export const fetchPlayerProfile = (playerId: string) =>
  api.get(`/players/${playerId}`).then((r) => r.data);

// Routed through app/api/players/search/route.ts (same-origin), not the
// external backend directly — that route applies per-IP rate limiting on
// top of the client-side debouncing in ScoutDashboardContent.
export const searchPlayersByName = async (name: string): Promise<Player[]> => {
  const res = await fetchWithRetry(
    `/api/players/search?name=${encodeURIComponent(name)}`,
  );
  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get('Retry-After') ?? '0');
    throw new SearchRateLimitedError(retryAfterSec);
  }
  if (!res.ok) {
    throw new Error('Failed to search players');
  }
  return res.json();
};

export const fetchPlayerComments = (playerId: string) =>
  api.get(`/players/${playerId}/comments`).then((r) => r.data);

export const archivePlayerProfile = (playerId: string): Promise<Player> =>
  api.post(`/players/${playerId}/archive`).then((r) => r.data);

export const unarchivePlayerProfile = (playerId: string): Promise<Player> =>
  api.post(`/players/${playerId}/unarchive`).then((r) => r.data);

export const linkBackupWallet = (
  playerId: string,
  backupWallet: string,
  signature: string,
): Promise<Player> =>
  api
    .post(`/players/${playerId}/backup-wallet/link`, {
      backupWallet,
      signature,
    })
    .then((r) => r.data);

export const removeBackupWallet = (playerId: string): Promise<Player> =>
  api.post(`/players/${playerId}/backup-wallet/remove`).then((r) => r.data);

export const claimAccountWithBackupWallet = (
  primaryWallet: string,
  backupWallet: string,
): Promise<{ playerId: string; wallet: string }> =>
  api
    .post('/players/recovery/claim', { primaryWallet, backupWallet })
    .then((r) => r.data);
