'use client';
import { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';
import { buildLogTrialOffer } from '@/lib/contract';
import { extractContractErrorKey } from '@/lib/contractErrorMessage';
import type { TrialOfferDetails } from '@/types';

export interface UseTrialOfferReturn {
  logTrialOffer: (playerId: string, details: TrialOfferDetails) => Promise<void>;
  loading: boolean;
  error: string | null;
  txHash: string | null;
}

export function useTrialOffer(): UseTrialOfferReturn {
  const { publicKey, signAndSubmit } = useWallet();
  const t = useTranslations('contractErrors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Monotonically-increasing counter. Each invocation captures its own id;
  // if a newer call arrives before this one resolves, the stale response is
  // silently discarded rather than overwriting the newer in-flight state.
  const callIdRef = useRef(0);

  const logTrialOffer = useCallback(
    async (playerId: string, details: TrialOfferDetails): Promise<void> => {
      const myCallId = ++callIdRef.current;

      // Reset all state for this fresh invocation
      setLoading(true);
      setError(null);
      setTxHash(null);

      try {
        if (!publicKey) throw new Error('Wallet not connected');

        const xdr = await buildLogTrialOffer(publicKey, playerId, details);
        if (myCallId !== callIdRef.current) return;

        const result = await signAndSubmit(xdr);
        if (myCallId !== callIdRef.current) return;

        setTxHash((result as any)?.hash ?? null);
      } catch (err) {
        if (myCallId !== callIdRef.current) return;
        const msg = err instanceof Error ? err.message : null;
        const key = msg ? extractContractErrorKey(msg) : null;
        setError(key ? t(key) : (msg ?? 'Transaction failed'));
      } finally {
        // Only the most-recent call is allowed to flip loading back to false
        if (myCallId === callIdRef.current) {
          setLoading(false);
        }
      }
    },
    [publicKey, signAndSubmit],
  );

  return { logTrialOffer, loading, error, txHash };
}
