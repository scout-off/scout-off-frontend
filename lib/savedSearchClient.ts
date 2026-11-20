import type { PlayerFilter, SavedSearch } from '@/types';
import { fetchWithRetry, fetchWithTimeout } from '@/lib/fetchWithRetry';
import * as api from '@/lib/generated/apiClient';

/**
 * Client for app/api/saved-searches — same-origin, cookie-authenticated.
 * Thin wrapper over the generated client (lib/generated/apiClient.ts, #1708).
 */

/**
 * Maps a non-2xx response to this client's historical errors: a 409 becomes
 * SavedSearchConflictError, anything else an Error with `message`.
 */
function failWith(message: string) {
  return (err: unknown): never => {
    if (!(err instanceof api.ApiError)) throw err;
    if (err.status === 409) {
      const body = (err.body ?? {}) as {
        current?: SavedSearch;
        currentVersion?: number;
      };
      throw new SavedSearchConflictError(
        'Saved search was modified elsewhere',
        body.current,
        body.currentVersion,
      );
    }
    throw new Error(message);
  };
}

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  return await api
    .listSavedSearches({ fetcher: fetchWithRetry })
    .catch(failWith('Failed to fetch saved searches'));
}

export class SavedSearchConflictError extends Error {
  readonly current?: SavedSearch;
  readonly currentVersion?: number;

  constructor(message: string, current?: SavedSearch, currentVersion?: number) {
    super(message);
    this.name = 'SavedSearchConflictError';
    this.current = current;
    this.currentVersion = currentVersion;
  }
}

// saveSearch/renameSavedSearch/removeSavedSearch deliberately use
// fetchWithTimeout rather than fetchWithRetry: these are mutations with no
// idempotency key, so an automatic retry after a lost response risks e.g.
// creating a duplicate saved search. fetchWithTimeout adds a 10 s deadline
// so the UI never hangs indefinitely on a flaky mobile connection
// (issue #1508).
export async function saveSearch(
  name: string,
  filter: PlayerFilter,
): Promise<SavedSearch> {
  return await api
    .createSavedSearch(name, { ...filter }, { fetcher: fetchWithTimeout })
    .catch(failWith('Failed to save search'));
}

/** Options for the If-Match-guarded mutations below. */
function versioned(version?: number): api.ApiRequestOptions {
  return {
    fetcher: fetchWithTimeout,
    headers: version !== undefined ? { 'If-Match': `"${version}"` } : {},
  };
}

export async function renameSavedSearch(
  id: number,
  name: string,
  version?: number,
): Promise<SavedSearch> {
  return await api
    .renameSavedSearch(id, name, versioned(version))
    .catch(failWith('Failed to rename saved search'));
}

export async function markSavedSearchViewed(
  id: number,
  version?: number,
): Promise<SavedSearch> {
  return await api
    .markSavedSearchViewed(id, versioned(version))
    .catch(failWith('Failed to mark saved search viewed'));
}

export async function removeSavedSearch(
  id: number,
  version?: number,
): Promise<void> {
  await api
    .deleteSavedSearch(id, versioned(version))
    .catch(failWith('Failed to remove saved search'));
}
