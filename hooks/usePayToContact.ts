'use client';
import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';
import { payToContact, getSubscription } from '@/lib/contract';
import { extractContractErrorKey } from '@/lib/contractErrorMessage';
import type { ContactDetails } from '@/types';

export function usePayToContact() {
  const { publicKey, signAndSubmit } = useWallet();
  const t = useTranslations('contractErrors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function mapErrorMessage(errorText: string): string {
    if (errorText.includes('code 3') || errorText.includes('InsufficientFee')) {
      return t('InsufficientFee');
    }
    if (
      errorText.includes('code 11') ||
      errorText.includes('SubscriptionExpired')
    ) {
      return t('SubscriptionExpired');
    }
    const key = extractContractErrorKey(errorText);
    return key ? t(key) : (errorText || t('unknown'));
  }

  const unlock = useCallback(
    async (playerId: string): Promise<void> => {
      function fail(msg: string): void {
        setError(msg);
        show({ message: msg, variant: 'error' });
      }

      if (!publicKey) {
        fail('Wallet not connected.');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // ── 1. Subscription gate ──────────────────────────────────────────────
        const subscription = await getSubscription(publicKey);
        const now = Date.now() / 1000;
        if (!subscription || subscription.expiresAt < now) {
          throw new Error('SubscriptionExpired');
        }

        // Call the contract function
        const contactDetails = await payToContact(publicKey, playerId, signAndSubmit);
        return contactDetails;
      } catch (e: any) {
        const msg = e?.message ?? 'An error occurred while contacting the player.';
        setError(msg);
        show({ message: msg, variant: 'error' });
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [publicKey, signAndSubmit],
  );

  return { unlock, loading, error };
}
