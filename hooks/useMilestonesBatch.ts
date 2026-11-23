'use client';
import useSWR from 'swr';
import { getMilestoneHistoryBatch } from '@/lib/contract';
import type { Milestone } from '@/types';

/**
 * Cache key scheme for useMilestonesBatch:
 *   "milestones-batch:{sorted,comma,joined,ids}"
 *
 * Keyed by the full sorted ID set rather than by scroll position, so the
 * key (and therefore the underlying RPC call) only changes when the
 * *result set* changes (a new search/filter), not on every scroll tick as
 * a virtualized window's visible slice shifts. Sorting makes the key
 * order-independent so re-sorted/filtered views of the same player set
 * reuse the same cache entry.
 */
export function milestonesBatchKey(playerIds: string[]): string | null {
  if (playerIds.length === 0) return null;
  return `milestones-batch:${Array.from(new Set(playerIds)).sort().join(',')}`;
}

export interface UseMilestonesBatchResult {
  /** Milestone history for each requested player ID, keyed by ID. */
  milestonesById: Record<string, Milestone[]>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Fetches milestone history for a whole batch of players in a single
 * request, replacing the pattern of every rendered PlayerCard independently
 * calling `getMilestoneHistory` (one Soroban RPC simulate call per card).
 *
 * All player data for a scout search is already resolved client-side in one
 * shot (see hooks/useScout.ts), so it's safe — and far cheaper — to also
 * resolve milestone data for the *entire* current result set once, then
 * hand each player's slice down as a prop. Virtualizing which cards are
 * mounted no longer implies re-fetching: the fetch is keyed to the result
 * set, not to what's currently scrolled into view.
 */
export function useMilestonesBatch(
  playerIds: string[],
): UseMilestonesBatchResult {
  const key = milestonesBatchKey(playerIds);

  const { data, error, isLoading } = useSWR<Record<string, Milestone[]>>(
    key,
    () => getMilestoneHistoryBatch(playerIds),
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    },
  );

  return {
    milestonesById: data ?? {},
    isLoading,
    error: error ?? null,
  };
}
