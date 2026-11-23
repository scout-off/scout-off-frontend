'use client';

import { useContractHealth } from '@/hooks/useContractHealth';

export default function useIsPaused() {
  const { paused } = useContractHealth();
  return paused === true;
}
