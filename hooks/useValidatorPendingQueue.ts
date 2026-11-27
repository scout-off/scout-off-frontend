'use client';

import { useCallback, useMemo } from 'react';
import useSWRInfinite from 'swr/infinite';
import { fetchPendingMilestoneSubmissions } from '@/lib/api';
import { useVisibilityInterval } from '@/hooks/useVisibilityInterval';
import type { MilestoneSubmission } from '@/types';

export const PENDING_QUEUE_PAGE_SIZE = 50;

export function pendingQueueKey(
  validatorAddress: string | null,
  cursor: string | null = null,
): string | null {
  if (!validatorAddress) return null;
  return cursor
    ? `pending-milestone-submissions:${validatorAddress}:${cursor}`
    : `pending-milestone-submissions:${validatorAddress}`;
}

/**
 * Returns the pending milestone submissions awaiting this validator's
 * review (issues #567, #568), oldest first as returned by the backend.
 *
 * Loads incrementally via cursor pagination (issue #1681): each page is
 * fetched on demand through `loadMore`, so a large backlog is never
 * downloaded or rendered all at once.
 *
 * Polls every 15s while the tab is visible so claim/lease presence
 * (issue #1680) stays live across an academy's signer wallets.
 */
export function useValidatorPendingQueue(validatorAddress: string | null) {
  const getKey = useCallback(
    (
      pageIndex: number,
      previousPage: {
        items: MilestoneSubmission[];
        nextCursor: string | null;
      } | null,
    ) => {
      if (!validatorAddress) return null;
      if (pageIndex > 0 && !previousPage?.nextCursor) return null;
      return pendingQueueKey(
        validatorAddress,
        previousPage?.nextCursor ?? null,
      );
    },
    [validatorAddress],
  );

  const { data, error, isValidating, mutate, size, setSize } = useSWRInfinite<{
    items: MilestoneSubmission[];
    nextCursor: string | null;
  }>(
    getKey,
    (key: string) => {
      const cursor = key.split(':')[2] ?? null;
      return fetchPendingMilestoneSubmissions(validatorAddress!, {
        limit: PENDING_QUEUE_PAGE_SIZE,
        cursor,
      });
    },
    {
      dedupingInterval: 10_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const submissions = useMemo(
    () => (data ?? []).flatMap((page) => page.items),
    [data],
  );

  const hasMore = Boolean(
    data && data.length > 0 && data[data.length - 1]?.nextCursor,
  );

  const loadMore = useCallback(() => {
    if (!validatorAddress || !hasMore) return;
    void setSize(size + 1);
  }, [validatorAddress, hasMore, setSize, size]);

  const refetch = useCallback(() => {
    if (validatorAddress) void mutate(undefined, { revalidate: true });
  }, [validatorAddress, mutate]);

  // Live presence: poll for lease changes while the queue is visible.
  useVisibilityInterval(refetch, 15_000);

  return {
    submissions,
    loading: isValidating && !data,
    loadingMore: isValidating && Boolean(data),
    hasMore,
    loadMore,
    error: error?.message ?? null,
    refetch,
  };
}
