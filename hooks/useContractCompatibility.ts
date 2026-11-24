'use client';
import { useEffect, useState } from 'react';
import type { ContractCompatibility } from '@/lib/contract';

/**
 * Runs the contract-version compatibility check once on mount (effectively
 * "on app load" for whichever page first mounts it) and exposes the result.
 * The underlying check is cached in lib/contract.ts, so mounting this from
 * multiple components does not trigger repeated RPC calls.
 *
 * lib/contract.ts (and @stellar/stellar-sdk) is dynamically imported here —
 * this hook runs from ContractIncompatibleBanner, mounted on every page via
 * the root layout, so a static import would put the whole SDK on every
 * page's critical path just for a background compatibility check.
 */
export function useContractCompatibility() {
  const [data, setData] = useState<ContractCompatibility | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('@/lib/contract').then(({ checkContractCompatibility }) =>
      checkContractCompatibility().then((result) => {
        if (!cancelled) setData(result);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    status: data?.status ?? 'unknown',
    message: data?.message ?? null,
    isIncompatible: data?.status === 'incompatible',
    isLoading: data === null,
  };
}
