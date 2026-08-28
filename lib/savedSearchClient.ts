import type { PlayerFilter, SavedSearch } from '@/types';
import { fetchWithRetry } from '@/lib/fetchWithRetry';

/** Client for app/api/saved-searches — same-origin, cookie-authenticated. */

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const res = await fetchWithRetry('/api/saved-searches');
  if (!res.ok) throw new Error('Failed to fetch saved searches');
  return res.json();
}

// saveSearch/renameSavedSearch/removeSavedSearch deliberately use a bare
// `fetch`, not `fetchWithRetry`: these are mutations with no idempotency
// key, so an automatic retry after a lost response risks e.g. creating a
// duplicate saved search.
export async function saveSearch(
  name: string,
  filter: PlayerFilter,
): Promise<SavedSearch> {
  const res = await fetch('/api/saved-searches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, filter }),
  });
  if (!res.ok) throw new Error('Failed to save search');
  return res.json();
}

export async function renameSavedSearch(
  id: number,
  name: string,
): Promise<SavedSearch> {
  const res = await fetch('/api/saved-searches', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name }),
  });
  if (!res.ok) throw new Error('Failed to rename saved search');
  return res.json();
}

export async function markSavedSearchViewed(id: number): Promise<SavedSearch> {
  const res = await fetch('/api/saved-searches', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, markViewed: true }),
  });
  if (!res.ok) throw new Error('Failed to mark saved search viewed');
  return res.json();
}

export async function removeSavedSearch(id: number): Promise<void> {
  const res = await fetch('/api/saved-searches', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error('Failed to remove saved search');
}
