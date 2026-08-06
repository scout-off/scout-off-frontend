'use client';
import useSWR from 'swr';
import { getPlayer } from '@/lib/contract';
import type { Player } from '@/types';

function compareKey(ids: string[]): string | null {
  if (ids.length === 0) return null;
  const sorted = [...ids].sort();
  return `compare:${sorted.join(',')}`;
}

async function fetchPlayers(ids: string[]): Promise<Player[]> {
  const results = await Promise.allSettled(
    ids.map((id) => getPlayer(id) as Promise<Player | null>),
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<Player> =>
        r.status === 'fulfilled' && r.value !== null,
    )
    .map((r) => r.value);
}

export function useComparePlayers(ids: string[]) {
  const key = compareKey(ids);

  const { data, error, isValidating } = useSWR<Player[]>(
    key,
    () => fetchPlayers(ids),
    {
      dedupingInterval: 5_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  return {
    players: data ?? [],
    loading: key !== null && isValidating && !data,
    error: error?.message ?? null,
  };
}
