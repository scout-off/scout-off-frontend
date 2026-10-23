'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useVisibilityInterval } from '@/hooks/useVisibilityInterval';

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

  // Guards against setting state after unmount — a poll can still be in
  // flight when the component goes away.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // isLoading only covers the first poll; later polls refresh silently and
  // a failure keeps the last good data.
  const poll = useCallback(async () => {
    try {
      const result = await fetchContractStatus();
      if (mountedRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useVisibilityInterval(poll, POLL_INTERVAL_MS, { runOnVisible: true });

  return {
    isPaused: data?.isPaused ?? false,
    isHealthy: data?.isHealthy ?? true,
    isLoading,
    error,
  };
}
