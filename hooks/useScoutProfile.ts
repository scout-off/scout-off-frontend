'use client';

import useSWR, { mutate as globalMutate } from 'swr';
import { fetchScoutProfile } from '@/lib/api';
import type { Scout } from '@/types';

/**
 * Cache key scheme for useScoutProfile:
 *   "scout:{id}"
 *
 * Mirrors the pattern used by hooks/usePlayer.ts — keys are fully
 * deterministic so SWR deduplicates concurrent requests for the same scout
 * id within the dedupe window.
 */
export function scoutProfileKey(scoutId: string | null): string | null {
  return scoutId ? `scout:${scoutId}` : null;
}

/**
 * Imperatively invalidate the scout-profile cache for a given scout id.
 * Call after any write operation that changes scout state.
 */
export function invalidateScoutProfileCache(scoutId: string): Promise<void> {
  return globalMutate(scoutProfileKey(scoutId)) as Promise<void>;
}

export interface UseScoutProfileReturn {
  scout: Scout | null;
  loading: boolean;
  isValidating: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useScoutProfile(scoutId: string | null): UseScoutProfileReturn {
  const { data, error, isValidating, mutate } = useSWR<Scout | null>(
    scoutProfileKey(scoutId),
    async () => {
      if (!scoutId) return null;
      const result = await fetchScoutProfile(scoutId);
      return (result as Scout | null) ?? null;
    },
    {
      dedupingInterval: 5_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  return {
    scout: data ?? null,
    loading: isValidating && !data,
    isValidating,
    error: error?.message ?? null,
    refetch: () => mutate().then(() => {}),
  };
}
