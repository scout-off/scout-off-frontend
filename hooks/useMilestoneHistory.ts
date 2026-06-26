"use client";
import { useState, useEffect } from "react";
import { getMilestoneHistory } from "@/lib/contract";

interface Milestone {
  id: string;
  description: string;
  evidenceHash: string;
  validator: string;
  timestamp: number;
}

interface UseMilestoneHistoryResult {
  milestones: Milestone[];
  isLoading: boolean;
  error: string | null;
}

export function useMilestoneHistory(playerId: string | null): UseMilestoneHistoryResult {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) return;
    setIsLoading(true);
    setError(null);
    getMilestoneHistory(playerId)
      .then((data) => setMilestones(data as Milestone[]))
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [playerId]);

  return { milestones, isLoading, error };
'use client';
import { useCallback } from 'react';
import useSWR from 'swr';
import { getMilestoneHistory } from '@/lib/contract';
import type { Milestone } from '@/types';

/**
 * Cache key scheme for useMilestoneHistory:
 *   "milestones:{playerID}"
 *
 * Fully deterministic — same playerID always produces the same key.
 * SWR deduplicates concurrent requests for the same key, preventing duplicate RPC calls.
 */
function milestonesKey(playerID: string | null): string | null {
  return playerID ? `milestones:${playerID}` : null;
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
      dedupingInterval: 60_000, // 60-second stale time — no duplicate RPC calls within this window
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const refetch = useCallback(() => {
    if (playerID) {
      // Bump the cache key to force a fresh fetch
      mutate(undefined, { revalidate: true });
    }
  }, [playerID, mutate]);

  return {
    milestones: milestones ?? [],
    loading: isValidating && !milestones,
    error: error?.message ?? null,
    refetch,
  };
}
