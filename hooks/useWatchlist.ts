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
