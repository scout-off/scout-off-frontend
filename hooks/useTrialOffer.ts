'use client';
import { useState, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { logTrialOffer } from '@/lib/contract';

export interface TrialOfferDetails {
  description: string;
  startDate: string;
  location: string;
}

export function useTrialOffer() {
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  /**
   * Map contract error codes to user-friendly messages.
   */
  function mapErrorMessage(errorText: string): string {
    if (errorText.includes('code 9') || errorText.includes('ContractPaused')) {
      return 'The contract is currently paused. Please try again later.';
    }
    if (errorText.includes('code 10') || errorText.includes('Unauthorized')) {
      return 'You are not authorized to log trial offers. Ensure you have an active scout subscription.';
    }
    return errorText || 'An error occurred while logging the trial offer.';
  }

  const submit = useCallback(
    async (playerId: string, details: TrialOfferDetails): Promise<void> => {
      if (!publicKey) throw new Error('Wallet not connected');

      setLoading(true);
      setError(null);
      setTxHash(null);

      try {
        // Serialize details to JSON string
        const detailsJson = JSON.stringify(details);

        // Call the contract function
        await logTrialOffer(publicKey, playerId, detailsJson);

        // Note: We don't get txHash from logTrialOffer directly, but in real implementation
        // the component would retrieve it from transaction history or events
        setTxHash('submitted');
      } catch (e: any) {
        const friendlyError = mapErrorMessage(e.message);
        setError(friendlyError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [publicKey],
  );

  return { submit, loading, error, txHash };
}
