'use client';
import useSWR from 'swr';
import { getPlayer } from '@/lib/contract';
import type { Player } from '@/types';

/**
 * Cache key scheme for usePlayer:
 *   "player:{walletOrId}"
 *
 * Keys are fully deterministic — same walletOrId always produces the same key.
 * SWR deduplicates concurrent requests for the same key, preventing duplicate RPC calls.
 */
function playerKey(walletOrId: string | null): string | null {
  return walletOrId ? `player:${walletOrId}` : null;
}

export function usePlayer(walletOrId: string | null) {
  const {
    data: player,
    error,
    isValidating,
    mutate,
  } = useSWR<Player | null>(
    playerKey(walletOrId),
    async () => {
      const result = await getPlayer(walletOrId!);
      return result as Player | null;
    },
    {
      dedupingInterval: 60_000, // 60-second stale time — no duplicate RPC calls within this window
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  return {
    player: player ?? null,
    loading: isValidating && !player,
    error: error?.message ?? null,
    refetch: () => mutate(),
  };
}
