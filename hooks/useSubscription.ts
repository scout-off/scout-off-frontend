'use client';
import { useState, useCallback } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { useWallet } from '@/hooks/useWallet';
import {
  getSubscription,
  subscribe as contractSubscribe,
} from '@/lib/contract';
import type { Subscription, SubscriptionTier } from '@/types';

/**
 * Cache key scheme for useSubscription:
 *   "subscription:{publicKey}"
 *
 * Null key when the wallet is not connected — SWR skips the fetch.
 */
export function subscriptionKey(publicKey: string | null): string | null {
  return publicKey ? `subscription:${publicKey}` : null;
}

/**
 * Imperatively invalidate the subscription cache for a given wallet.
 * Call after any write that changes subscription state.
 */
export function invalidateSubscriptionCache(publicKey: string): Promise<void> {
  return globalMutate(subscriptionKey(publicKey)) as Promise<void>;
}

export function useSubscription() {
  const { publicKey, signAndSubmit } = useWallet();

  // Write-path loading and error are kept in local state because SWR only
  // manages read-path state. This preserves the original hook's API exactly.
  const [writeLoading, setWriteLoading] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const {
    data: subscription,
    error: readError,
    isValidating,
    mutate,
  } = useSWR<Subscription | null>(
    subscriptionKey(publicKey),
    async () => {
      const data = await getSubscription(publicKey!);
      return (data as Subscription) ?? null;
    },
    {
      dedupingInterval: 5_000,   // deduplicate concurrent reads within 5 s
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const subscribe = useCallback(
    async (tier: SubscriptionTier) => {
      if (!publicKey) throw new Error('Wallet not connected');
      setWriteLoading(true);
      setWriteError(null);
      try {
        await contractSubscribe(publicKey, tier, signAndSubmit);
        // Revalidate the cached subscription so callers see the updated state.
        await mutate();
      } catch (e: any) {
        setWriteError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setWriteLoading(false);
      }
    },
    [publicKey, signAndSubmit, mutate],
  );

  const isExpired = subscription
    ? subscription.expiresAt < Date.now() / 1000
    : false;

  return {
    subscription: subscription ?? null,
    isExpired,
    subscribe,
    loading: isValidating || writeLoading,
    error: writeError ?? (readError ? (readError instanceof Error ? readError.message : String(readError)) : null),
  };
}
