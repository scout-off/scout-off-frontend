'use client';
import useSWR from 'swr';
import { getContractHealth, getContractPaused } from '@/lib/contract';

/**
 * Cache key for the contract status check.
 * Single fixed key — there is only one contract to poll.
 */
const CONTRACT_STATUS_KEY = 'contract:status';

interface ContractStatusData {
  isHealthy: boolean;
  isPaused: boolean;
}

async function fetchContractStatus(): Promise<ContractStatusData> {
  const [isHealthy, isPaused] = await Promise.all([
    getContractHealth()
      .then((): boolean => true)
      .catch((): boolean => false),
    getContractPaused().catch((): boolean => false),
  ]);
  return {
    isHealthy,
    isPaused: isPaused === true,
  };
}

/**
 * Reads contract health and paused state via SWR.
 *
 * - dedupingInterval: 5 s — multiple components mounting at once share one RPC burst
 * - refreshInterval: 60 s — background re-poll matches previous setInterval cadence
 * - revalidateOnFocus: false — avoid spurious re-checks on window focus
 * - shouldRetryOnError: false — contract unreachable is not a transient error worth
 *   hammering with exponential back-off
 */
export function useContractStatus() {
  const { data, isLoading } = useSWR<ContractStatusData>(
    CONTRACT_STATUS_KEY,
    fetchContractStatus,
    {
      dedupingInterval: 5_000,
      refreshInterval: 60_000,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  return {
    isPaused: data?.isPaused ?? false,
    isHealthy: data?.isHealthy ?? true,
    isLoading,
  };
}
