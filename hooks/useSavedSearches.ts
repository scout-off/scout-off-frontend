'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import {
  fetchSavedSearches,
  markSavedSearchViewed,
  removeSavedSearch,
  renameSavedSearch,
  saveSearch,
} from '@/lib/savedSearchClient';
import { filterPlayers } from '@/lib/contract';
import { scoutSearchKey } from './useScout';
import { useUndoableRemoval } from './useUndoableRemoval';
import type { Player, PlayerFilter, SavedSearch } from '@/types';

/** SWR key for the current scout's saved-searches cache. */
export function savedSearchesKey(scoutWallet: string | null): string | null {
  return scoutWallet ? `saved-searches:${scoutWallet}` : null;
}

/**
 * Tracks the authenticated scout's saved searches. `remove` is undoable: the
 * item disappears immediately, but the DELETE call is deferred behind an
 * "Undo" toast (see useUndoableRemoval).
 */
export function useSavedSearches(scoutWallet: string | null) {
  const { data, error, isValidating, mutate } = useSWR<SavedSearch[]>(
    savedSearchesKey(scoutWallet),
    fetchSavedSearches,
    {
      dedupingInterval: 5_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const undoableRemove = useUndoableRemoval();

  const save = useCallback(
    async (name: string, filter: PlayerFilter) => {
      await saveSearch(name, filter);
      mutate();
    },
    [mutate],
  );

  const rename = useCallback(
    async (id: number, newName: string) => {
      await renameSavedSearch(id, newName);
      mutate();
    },
    [mutate],
  );

  const markViewed = useCallback(
    async (entry: SavedSearch) => {
      const updated = await markSavedSearchViewed(entry.id);
      mutate(
        (current) =>
          (current ?? []).map((e) => (e.id === updated.id ? updated : e)),
        false,
      );
    },
    [mutate],
  );

  const remove = useCallback(
    (entry: SavedSearch) => {
      undoableRemove({
        id: entry.id,
        message: 'Saved search removed',
        onOptimisticRemove: () =>
          mutate(
            (current) => (current ?? []).filter((e) => e.id !== entry.id),
            false,
          ),
        onRestore: () =>
          mutate((current) => [entry, ...(current ?? [])], false),
        onCommit: async () => {
          try {
            await removeSavedSearch(entry.id);
          } finally {
            mutate();
          }
        },
      });
    },
    [undoableRemove, mutate],
  );

  return {
    searches: data ?? [],
    loading: isValidating && !data,
    error: error?.message ?? null,
    save,
    rename,
    remove,
    markViewed,
  };
}

/**
 * Counts players matching a saved search's filter that were created after
 * `lastViewedAt` — the "new since last viewed" badge. Keyed identically to
 * useScout's own search cache (scoutSearchKey), so a saved search sharing a
 * filter with the scout's active search reuses that result instead of
 * triggering a second contract call.
 */
export function useSavedSearchNewCount(
  filter: PlayerFilter,
  lastViewedAt: number,
): number {
  const { data } = useSWR<Player[]>(
    scoutSearchKey(filter),
    async () => {
      const results = await filterPlayers(
        filter.region ?? '',
        filter.position ?? '',
        filter.minLevel ?? 0,
      );
      return (results as Player[]).filter((p) => !p.archived);
    },
    {
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  if (!data) return 0;
  return data.filter((p) => p.createdAt > lastViewedAt).length;
}
