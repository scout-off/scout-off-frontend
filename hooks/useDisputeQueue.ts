'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { decideDispute, fetchDisputeQueue } from '@/lib/disputesClient';
import type { MilestoneDispute, MilestoneDisputeStatus } from '@/types';

/** SWR key for the admin dispute review queue, optionally filtered by status. */
export function disputeQueueKey(status?: MilestoneDisputeStatus): string {
  return status ? `disputes:queue:${status}` : 'disputes:queue:all';
}

/**
 * Drives the admin review queue for disputed milestones (issue #562).
 * `decide` calls PATCH /api/disputes/:id/decide — the caller is
 * responsible for having already submitted the on-chain revoke_milestone
 * transaction (via useValidator().revokeMilestone) before calling `decide`
 * with status 'reversed' and the resulting tx hash.
 */
export function useDisputeQueue(status?: MilestoneDisputeStatus) {
  const { data, error, isValidating, mutate } = useSWR<MilestoneDispute[]>(
    disputeQueueKey(status),
    () => fetchDisputeQueue(status),
    {
      dedupingInterval: 10_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const decide = useCallback(
    async (
      id: number,
      decision: {
        status: 'upheld' | 'reversed';
        resolutionNote?: string;
        revokeTxHash?: string;
      },
    ) => {
      const updated = await decideDispute(id, decision);
      mutate(
        (current) => (current ?? []).filter((d) => d.id !== updated.id),
        false,
      );
      return updated;
    },
    [mutate],
  );

  return {
    disputes: data ?? [],
    loading: isValidating && !data,
    error: error?.message ?? null,
    decide,
    refetch: () => mutate(),
  };
}
