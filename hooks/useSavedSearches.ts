'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import {
  fetchSavedSearches,
  removeSavedSearch,
  renameSavedSearch,
  saveSearch,
} from '@/lib/savedSearchClient';
import { useUndoableRemoval } from './useUndoableRemoval';
import type { PlayerFilter, SavedSearch } from '@/types';

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
  };
}
