'use client';
import { useState, useEffect, useRef } from 'react';
import { getContractHealth, getContractPaused } from '@/lib/contract';

export function useContractStatus() {
  const [isPaused, setIsPaused] = useState(false);
  const [isHealthy, setIsHealthy] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    async function check() {
      try {
        const [healthOk, paused] = await Promise.all([
          getContractHealth().then((): boolean => true).catch((): boolean => false),
          getContractPaused().catch((): boolean => false),
        ]);
        if (!mounted.current) return;
        setIsHealthy(healthOk);
        setIsPaused(paused === true);
      } catch {
        if (!mounted.current) return;
        setIsHealthy(false);
        setIsPaused(false);
      } finally {
        if (mounted.current) setIsLoading(false);
      }
    }

    check();
    const id = setInterval(check, 60_000);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, []);

  return { isPaused, isHealthy, isLoading };
}
