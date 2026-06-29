'use client';
import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { filterPlayers } from '@/lib/contract';
import { searchPlayersByName } from '@/lib/api';
import type { Player, PlayerFilter } from '@/types';

function contractKey(filter: PlayerFilter): string {
  return `scout:contract:${filter.region ?? ''}:${filter.position ?? ''}:${filter.minLevel ?? 0}`;
}

export function useScout() {
  const [searchKey, setSearchKey] = useState<string | null>(null);

  const { data, error, isValidating } = useSWR<Player[]>(
    searchKey,
    async (key: string) => {
      if (key.startsWith('scout:name:')) {
        const name = key.slice('scout:name:'.length);
        return searchPlayersByName(name);
      }
      // contract filter key: "scout:contract:{region}:{position}:{minLevel}"
      const parts = key.split(':');
      const region = parts[2] ?? '';
      const position = parts[3] ?? '';
      const minLevel = Number(parts[4] ?? 0);
      return (await filterPlayers(region, position, minLevel)) as Player[];
    },
    { dedupingInterval: 60_000, revalidateOnFocus: false, errorRetryCount: 2 },
  );

  const search = useCallback((filter: PlayerFilter) => {
    setSearchKey(contractKey(filter));
  }, []);

  const searchByName = useCallback((name: string) => {
    setSearchKey(name ? `scout:name:${name}` : null);
  }, []);

  return {
    players: data ?? [],
    loading: isValidating,
    error: error?.message ?? null,
    search,
    searchByName,
  };
}
