'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import {
  addToWatchlist,
  fetchWatchlist,
  removeFromWatchlist,
} from '@/lib/watchlistClient';
import { useUndoableRemoval } from './useUndoableRemoval';
import type { WatchlistEntry } from '@/types';

/** SWR key for the current scout's watchlist cache. */
export function watchlistKey(scoutWallet: string | null): string | null {
  return scoutWallet ? `watchlist:${scoutWallet}` : null;
}

/**
 * Tracks the authenticated scout's watchlisted players. `remove` is
 * undoable: the item disappears immediately, but the DELETE call is
 * deferred behind an "Undo" toast (see useUndoableRemoval).
 *
 * Issue #1132: useUndoableRemoval is wired here so that:
 *  - The entry vanishes from the list on click (optimistic removal).
 *  - An "Undo" toast appears for the configured window (default 5 s).
 *  - The DELETE /api/watchlist request only fires once the window
 *    elapses uninterrupted.
 *  - Clicking Undo within the window restores the entry with no API call.
 *  - A second remove call for the same entry while its timer is still
 *    pending is silently ignored — no double-commit (guarded by the
 *    id-keyed timer map inside useUndoableRemoval).
 */
export function useWatchlist(scoutWallet: string | null) {
  const { data, error, isValidating, mutate } = useSWR<WatchlistEntry[]>(
    watchlistKey(scoutWallet),
    fetchWatchlist,
    {
      dedupingInterval: 5_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const undoableRemove = useUndoableRemoval();

  const add = useCallback(
    async (playerId: string) => {
      await addToWatchlist(playerId);
      mutate();
    },
    [mutate],
  );

  const remove = useCallback(
    (entry: WatchlistEntry) => {
      undoableRemove({
        id: entry.id,
        message: 'Removed from watchlist',
        onOptimisticRemove: () =>
          mutate(
            (current) => (current ?? []).filter((e) => e.id !== entry.id),
            false,
          ),
        onRestore: () =>
          mutate((current) => [entry, ...(current ?? [])], false),
        onCommit: async () => {
          try {
            await removeFromWatchlist(entry.id);
          } finally {
            mutate();
          }
        },
      });
    },
    [undoableRemove, mutate],
  );

  const entries = data ?? [];

  return {
    entries,
    loading: isValidating && !data,
    error: error?.message ?? null,
    isWatched: (playerId: string) =>
      entries.some((e) => e.playerId === playerId),
    add,
    remove,
  };
}
