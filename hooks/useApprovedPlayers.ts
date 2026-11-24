'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { fetchValidatorEvents } from '@/lib/indexerClient';
import { fetchPlayerProfile } from '@/lib/api';
import type { Player } from '@/types';
import type { IndexedEvent } from '@/lib/indexerClient';

const MAX_PAGES = 10;

/**
 * Fetches all `milestone_approved` events for a given validator address from
 * the indexer (paginated), then deduplicates to unique player IDs and fetches
 * the corresponding Player profiles.
 */
async function fetchApprovedPlayers(
  validatorAddress: string,
): Promise<Player[]> {
  const allEvents: IndexedEvent[] = [];
  let cursor: number | undefined;

  // 1. Fetch all milestone_approved events by this validator
  for (let page = 0; page < MAX_PAGES; page++) {
    const { events, nextCursor } = await fetchValidatorEvents(
      validatorAddress,
      {
        type: 'milestone_approved',
        limit: 200,
        before: cursor,
      },
    );

    allEvents.push(...events);
    if (nextCursor === null) break;
    cursor = nextCursor;
  }

  // 2. Deduplicate to unique player IDs
  const playerIds = [
    ...new Set(
      allEvents
        .map((e) => e.playerId)
        .filter((id): id is string => id !== null),
    ),
  ];

  if (playerIds.length === 0) return [];

  // 3. Fetch player profiles (with individual error tolerance)
  const players: Player[] = [];
  for (const id of playerIds) {
    try {
      const player = await fetchPlayerProfile(id);
      if (player) players.push(player);
    } catch {
      // Skip players whose profiles can't be fetched (removed, network err, etc.)
    }
  }

  return players;
}

/**
 * SWR key for the approved players cache.
 */
export function approvedPlayersKey(
  validatorAddress: string | null,
): string | null {
  return validatorAddress ? `approved-players:${validatorAddress}` : null;
}

/**
 * Returns all players whose milestones have been approved by the given
 * validator address.
 *
 * Reads from the indexer's validator-events endpoint, deduplicates to unique
 * player IDs, and fetches the corresponding Player profiles via the backend API.
 */
export function useApprovedPlayers(validatorAddress: string | null) {
  const { data, error, isValidating, mutate } = useSWR<Player[]>(
    approvedPlayersKey(validatorAddress),
    () => fetchApprovedPlayers(validatorAddress!),
    {
      dedupingInterval: 30_000, // 30 s — data doesn't change rapidly
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const refetch = useCallback(() => {
    if (validatorAddress) mutate(undefined, { revalidate: true });
  }, [validatorAddress, mutate]);

  return {
    players: data ?? [],
    loading: isValidating && !data,
    error: error?.message ?? null,
    refetch,
  };
}
