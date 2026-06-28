'use client';
import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';
import {
  getValidators,
  buildApproveMilestone,
  buildRevokeMilestone,
} from '@/lib/contract';
import { parseContractError } from '@/lib/contractErrorMessage';
import type { ValidatorInfo, Player } from '@/types';

const CACHE_TTL_MS = 60_000;

let cachedValidators: ValidatorInfo[] | null = null;
let cacheTimestamp = 0;

export function invalidateValidatorCache() {
  cachedValidators = null;
  cacheTimestamp = 0;
}

async function fetchValidators(): Promise<ValidatorInfo[]> {
  const now = Date.now();
  if (cachedValidators && now - cacheTimestamp < CACHE_TTL_MS)
    return cachedValidators;
  const list = await getValidators();
  cachedValidators = list;
  cacheTimestamp = now;
  return list;
}

export function useValidator(walletAddress?: string | null) {
  const { publicKey: ctxKey, signAndSubmit } = useWallet();
  const publicKey = walletAddress !== undefined ? walletAddress : ctxKey;

  const [isValidator, setIsValidator] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setIsValidator(false);
      return;
    }
    setChecking(true);
    fetchValidators()
      .then((list) => setIsValidator(list.some((v) => v.address === publicKey)))
      .catch(() => setIsValidator(false))
      .finally(() => setChecking(false));
  }, [publicKey]);

  const approveMilestone = useCallback(
    async (playerId: string, milestone: string): Promise<string> => {
      if (!publicKey) throw new Error('Wallet not connected');
      setLoading(true);
      setError(null);
      try {
        return await buildApproveMilestone(publicKey, playerId, milestone);
      } catch (e: any) {
        const msg = parseContractError(e);
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [publicKey],
  );

  const revokeMilestone = useCallback(
    async (playerId: string, milestoneId: string): Promise<Player> => {
      if (!publicKey) throw new Error('Wallet not connected');
      setLoading(true);
      setError(null);
      try {
        const xdr = await buildRevokeMilestone(
          publicKey,
          playerId,
          milestoneId,
        );
        const result = await signAndSubmit(xdr);
        return result as Player;
      } catch (e: any) {
        const msg = parseContractError(e);
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [publicKey, signAndSubmit],
  );

  return {
    isValidator,
    checking,
    approveMilestone,
    revokeMilestone,
    loading,
    error,
  };
}
