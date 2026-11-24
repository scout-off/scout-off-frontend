'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import {
  createDispute,
  fetchMyDisputes,
  type CreateDisputeParams,
} from '@/lib/disputesClient';
import type { MilestoneDispute } from '@/types';

/** SWR key for the current wallet's own disputes cache. */
export function myDisputesKey(wallet: string | null): string | null {
  return wallet ? `disputes:mine:${wallet}` : null;
}

/**
 * Tracks the authenticated player's own milestone disputes, for surfacing
 * dispute status on their MilestoneTimeline (issue #562).
 */
export function useMilestoneDisputes(wallet: string | null) {
  const { data, error, isValidating, mutate } = useSWR<MilestoneDispute[]>(
    myDisputesKey(wallet),
    fetchMyDisputes,
    {
      dedupingInterval: 10_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const disputes = data ?? [];

  const file = useCallback(
    async (params: CreateDisputeParams) => {
      const dispute = await createDispute(params);
      mutate((current) => [dispute, ...(current ?? [])], false);
      return dispute;
    },
    [mutate],
  );

  return {
    disputes,
    loading: isValidating && !data,
    error: error?.message ?? null,
    file,
    findByMilestoneId: (milestoneId: string) =>
      disputes.find((d) => d.milestoneId === milestoneId),
  };
}
