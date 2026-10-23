'use client';
import { useState, useEffect } from 'react';

interface ContractStatusData {
  isHealthy: boolean;
  isPaused: boolean;
}

const POLL_INTERVAL_MS = 60_000;

// lib/contract.ts (and the @stellar/stellar-sdk it pulls in) is dynamically
// imported here rather than statically — this hook runs from Navbar, which
// is mounted on every page via the root layout, so a static import would
// put the whole SDK on every page's critical path just for a background
// health-check poll.
async function fetchContractStatus(): Promise<ContractStatusData> {
  const { getContractHealth, getContractPaused } =
    await import('@/lib/contract');
  const [isHealthy, isPaused] = await Promise.all([
    (async () => {
      try {
        await getContractHealth();
        return true;
      } catch {
        return false;
      }
    })(),
    (async () => {
      try {
        const v = await getContractPaused();
        return v === true;
      } catch {
        return false;
      }
    })(),
  ]);
  return { isHealthy, isPaused };
}

export function useContractStatus() {
  const [data, setData] = useState<ContractStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    // isLoading only covers the first poll; later polls refresh silently and
    // a failure keeps the last good data.
    async function poll() {
      try {
        const result = await fetchContractStatus();
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return {
    isPaused: data?.isPaused ?? false,
    isHealthy: data?.isHealthy ?? true,
    isLoading,
    error,
  };
}
