'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { fetchPendingMilestoneSubmissions } from '@/lib/api';
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

  return {
    submissions: data ?? [],
    loading: isValidating && !data,
    error: error?.message ?? null,
    refetch,
  };
}
