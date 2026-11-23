'use client';
import { useCallback } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { getMilestoneHistory } from '@/lib/contract';
import { getMilestoneHistoryFromIndexer } from '@/lib/indexerClient';
import type { Milestone } from '@/types';

/**
 * Reads from packages/indexer's query API first — off-chain, so it doesn't
 * hit Soroban RPC — and only falls back to the direct contract simulation
 * (`getMilestoneHistory`) if the indexer is unreachable or errors, so a
 * dev environment without the indexer running (or a temporary indexer
 * outage) doesn't take milestone history down with it.
 */
async function fetchMilestoneHistory(playerID: string): Promise<Milestone[]> {
  try {
    return await getMilestoneHistoryFromIndexer(playerID);
  } catch {
    const result = await getMilestoneHistory(playerID);
    return (result as Milestone[] | null) ?? [];
  }
}

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
    () => fetchMilestoneHistory(playerID!),
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
