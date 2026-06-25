'use client';
import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/components/ui/Toast';
import {
  buildPayToContact,
  getSubscription,
  PLATFORM_CONTACT_FEE_XLM,
} from '@/lib/contract';
import { extractContractErrorKey } from '@/lib/contractErrorMessage';

export function usePayToContact() {
  const { publicKey, signAndSubmit, xlmBalance } = useWallet();
  const { show } = useToast();
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
          fail(
            'An active subscription is required to contact players. Please subscribe or renew.',
          );
          return;
        }

        // ── 2. Balance gate ───────────────────────────────────────────────────
        const balance = parseFloat(xlmBalance ?? '0');
        if (balance < PLATFORM_CONTACT_FEE_XLM) {
          fail(
            `Insufficient XLM. You need at least ${PLATFORM_CONTACT_FEE_XLM} XLM to contact this player.`,
          );
          return;
        }

        // ── 3. Build and sign ─────────────────────────────────────────────────
        const xdr = await buildPayToContact(publicKey, playerId);
        await signAndSubmit(xdr);
      } catch (e: any) {
        fail(mapErrorMessage(e?.message ?? ''));
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [publicKey, xlmBalance, signAndSubmit, show],
  );

  return { unlock, loading, error };
}
