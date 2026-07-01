'use client';
import { useCallback } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { getMilestoneHistory } from '@/lib/contract';
import type { Milestone } from '@/types';

/**
 * Cache key scheme for useMilestoneHistory:
 *   "milestones:{playerID}"
 *
 * Fully deterministic — same playerID always produces the same key.
 * SWR deduplicates concurrent requests for the same key within dedupingInterval,
 * preventing duplicate RPC calls when multiple components render with the same playerID.
 */
export function milestonesKey(playerID: string | null): string | null {
  return playerID ? `milestones:${playerID}` : null;
}

/**
 * Imperatively invalidate the milestones cache for a given player.
 * Call after any write operation that changes a player's milestone list.
 */
export function invalidateMilestonesCache(playerID: string): Promise<void> {
  return globalMutate(milestonesKey(playerID)) as Promise<void>;
}

export function useMilestoneHistory(playerID: string | null) {
  const {
    data: milestones,
    error,
    isValidating,
    mutate,
  } = useSWR<Milestone[]>(
    milestonesKey(playerID),
    async () => {
      const result = await getMilestoneHistory(playerID!);
      return (result as Milestone[] | null) ?? [];
    },
    {
      dedupingInterval: 5_000, // no duplicate RPC calls for the same player within 5 s
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const refetch = useCallback(() => {
    if (playerID) mutate(undefined, { revalidate: true });
  }, [playerID, mutate]);

  const isLoading = isValidating && !milestones;

  return {
    milestones: milestones ?? [],
    /** @deprecated Use `isLoading` */
    loading: isLoading,
    isLoading,
    error: error?.message ?? null,
    refetch,
  };
}
