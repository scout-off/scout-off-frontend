'use client';
import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';
import {
  getSubscription,
  subscribe as contractSubscribe,
} from '@/lib/contract';
import { parseContractError } from '@/lib/contractErrorMessage';
import type { Subscription, SubscriptionTier } from '@/types';

export function useSubscription() {
  const { publicKey, signAndSubmit } = useWallet();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = useCallback(async () => {
    if (!publicKey) {
      setSubscription(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getSubscription(publicKey);
      setSubscription((data as Subscription) ?? null);
    } catch (e: any) {
      const msg = parseContractError(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const subscribe = useCallback(
    async (tier: SubscriptionTier) => {
      if (!publicKey) throw new Error('Wallet not connected');
      setLoading(true);
      setError(null);
      try {
        await contractSubscribe(publicKey, tier, signAndSubmit);
        await fetchSubscription();
      } catch (e: any) {
        const msg = parseContractError(e);
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [publicKey, signAndSubmit, fetchSubscription],
  );

  const isExpired = subscription
    ? subscription.expiresAt < Date.now() / 1000
    : false;

  return { subscription, isExpired, subscribe, loading, error };
}
