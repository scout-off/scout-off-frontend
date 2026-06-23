'use client';
import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { filterPlayers } from '@/lib/contract';
import type { Player, PlayerFilter } from '@/types';

/**
 * Cache key scheme for useScout:
 *   "scout:search:{region}:{position}:{minLevel}"
 *
 * All filter dimensions are encoded in the key so different filter combos
 * get separate caches. SWR deduplicates concurrent requests for the same
 * key, preventing duplicate RPC calls.
 */
function scoutSearchKey(filter: PlayerFilter): string {
  return `scout:search:${filter.region ?? ''}:${filter.position ?? ''}:${filter.minLevel ?? 0}`;
}

export function useScout() {
  const [searchKey, setSearchKey] = useState<string | null>(null);

  const { data, error, isValidating } = useSWR<Player[]>(
    searchKey,
    async (key: string) => {
      const parts = key.split(':');
      const region = parts[2] ?? '';
      const position = parts[3] ?? '';
      const minLevel = Number(parts[4] ?? 0);
      const results = await filterPlayers(region, position, minLevel);
      return results as Player[];
    },
    {
      dedupingInterval: 60_000, // 60-second stale time — no duplicate RPC calls within this window
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  /** Trigger a search with the given filter. The returned loading/isValidating
   *  state can be observed via the reactive `loading` property. */
  const search = useCallback((filter: PlayerFilter) => {
    const key = scoutSearchKey(filter);
    setSearchKey(key);
  }, []);

  return {
    players: data ?? [],
    loading: isValidating,
    error: error?.message ?? null,
    search,
  };
}
