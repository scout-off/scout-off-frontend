'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { fetchPendingMilestoneSubmissions } from '@/lib/api';
import { useVisibilityInterval } from '@/hooks/useVisibilityInterval';
import type { MilestoneSubmission } from '@/types';

export function pendingQueueKey(
  validatorAddress: string | null,
): string | null {
  return validatorAddress
    ? `pending-milestone-submissions:${validatorAddress}`
    : null;
}

/**
 * Returns the pending milestone submissions awaiting this validator's
 * review (issues #567, #568), oldest first as returned by the backend.
 *
 * Polls every 15s while the tab is visible so claim/lease presence
 * (issue #1680) stays live across an academy's signer wallets.
 */
export function useValidatorPendingQueue(validatorAddress: string | null) {
  const { data, error, isValidating, mutate } = useSWR<MilestoneSubmission[]>(
    pendingQueueKey(validatorAddress),
    () => fetchPendingMilestoneSubmissions(validatorAddress!),
    {
      dedupingInterval: 10_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const refetch = useCallback(() => {
    if (validatorAddress) mutate(undefined, { revalidate: true });
  }, [validatorAddress, mutate]);

  // Live presence: poll for lease changes while the queue is visible.
  useVisibilityInterval(refetch, 15_000);

  return {
    submissions: data ?? [],
    loading: isValidating && !data,
    error: error?.message ?? null,
    refetch,
  };
}
