'use client';
import { useContractStatus } from '@/hooks/useContractStatus';

export function useContractHealth() {
  const { isHealthy, isPaused, isLoading } = useContractStatus();
  return { healthy: isHealthy, paused: isPaused, loading: isLoading };
}
