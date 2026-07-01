'use client';
import { useState, useEffect } from 'react';
import { getContractHealth, getContractPaused } from '@/lib/contract';

interface ContractStatusData {
  isHealthy: boolean;
  isPaused: boolean;
}

const POLL_INTERVAL_MS = 60_000;

async function fetchContractStatus(): Promise<ContractStatusData> {
  const [isHealthy, isPaused] = await Promise.all([
    (async () => {
      try { await getContractHealth(); return true; }
      catch { return false; }
    })(),
    (async () => {
      try { const v = await getContractPaused(); return v === true; }
      catch { return false; }
    })(),
  ]);
  return { isHealthy, isPaused };
}

export function useContractStatus() {
  const [data, setData] = useState<ContractStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      setIsLoading(true);
      const result = await fetchContractStatus();
      if (!cancelled) {
        setData(result);
        setIsLoading(false);
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
  };
}
