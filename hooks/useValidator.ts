'use client';
import { useState, useCallback } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { useWallet } from '@/hooks/useWallet';
import {
  getValidators,
  buildApproveMilestone,
  buildRevokeMilestone,
} from '@/lib/contract';
import { parseContractError } from '@/lib/contractErrorMessage';
import type { ValidatorInfo, Player } from '@/types';

/** Fixed cache key — the validator list is global, not per-wallet. */
const VALIDATORS_KEY = 'contract:validators';

/**
 * Imperatively invalidate the validators SWR cache.
 * Exported for use in tests (beforeEach cleanup) and after admin write operations.
 */
export function invalidateValidatorCache(): Promise<void> {
  return globalMutate(VALIDATORS_KEY, undefined, {
    revalidate: false,
  }) as Promise<void>;
}

export function useValidator(walletAddress?: string | null) {
  const { publicKey: ctxKey, signAndSubmit } = useWallet();
  const publicKey = walletAddress !== undefined ? walletAddress : ctxKey;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch the validator list via SWR.
   * dedupingInterval: 60 s — the validator list changes rarely; multiple
   * components mounting simultaneously share one RPC call.
   */
  const { data: validators, isLoading: checking } = useSWR<ValidatorInfo[]>(
    VALIDATORS_KEY,
    () => getValidators() as Promise<ValidatorInfo[]>,
    {
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const isValidator = publicKey
    ? (validators ?? []).some((v) => v.address === publicKey)
    : false;

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
        // Invalidate the player cache so callers see updated progressLevel.
        await globalMutate(`player:${playerId}`);
        // Invalidate the milestones cache for this player.
        await globalMutate(`milestones:${playerId}`);
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
    /** True while the initial validator-list fetch is in-flight. */
    checking,
    approveMilestone,
    revokeMilestone,
    loading,
    error,
  };
}
