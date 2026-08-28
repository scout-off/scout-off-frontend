'use client';

import { useState, useEffect, useCallback } from 'react';
import { CONTACT_FEE_XLM } from '@/lib/feeSchedule';
import { getContactFee } from '@/lib/contract';

export interface FeeDriftState {
  hasDrift: boolean;
  liveContactFee: number | null;
  expectedContactFee: number;
  warningMessage: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook to detect drift between the platform's build-time fee schedule
 * and current on-chain contract pricing parameters.
 *
 * If the deployed contract's `get_contact_fee` returns an amount different from
 * `CONTACT_FEE_XLM`, `hasDrift` will be true and `warningMessage` will describe
 * the divergence so admin/scout analytics views can warn users.
 */
export function useFeeDriftDetection(): FeeDriftState {
  const [liveContactFee, setLiveContactFee] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkDrift = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fee = await getContactFee();
      setLiveContactFee(fee);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to verify on-chain fee parameters');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkDrift();
  }, [checkDrift]);

  const hasDrift = liveContactFee !== null && liveContactFee !== CONTACT_FEE_XLM;
  const warningMessage = hasDrift
    ? `On-chain fee drift detected: Contract pay-to-contact fee is currently ${liveContactFee} XLM, but the frontend fee schedule is configured for ${CONTACT_FEE_XLM} XLM. Revenue and spending analytics for events without explicit amounts may be approximations.`
    : null;

  return {
    hasDrift,
    liveContactFee,
    expectedContactFee: CONTACT_FEE_XLM,
    warningMessage,
    loading,
    error,
    refetch: checkDrift,
  };
}
