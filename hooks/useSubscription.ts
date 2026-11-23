'use client';
import { useState, useCallback } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { useWallet } from '@/hooks/useWallet';
import { useSubmissionGuard } from '@/hooks/useSubmissionGuard';
import {
  getSubscription,
  subscribe as contractSubscribe,
} from '@/lib/contract';
import { TransactionFailedError, TransactionTimeoutError } from '@/lib/stellar';
import type { Subscription, SubscriptionTier } from '@/types';

const MILLISECONDS_PER_SECOND = 1000; // Convert Date.now() timestamps to Unix seconds.
const SUBSCRIPTION_DEDUPING_INTERVAL_MS = 5_000; // Deduplicate concurrent read calls within 5 seconds.
const SUBSCRIPTION_READ_ERROR_RETRY_COUNT = 2; // Retry failed subscription reads twice.

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

/**
 * The fine-grained write-path state for the subscription purchase flow.
 *
 * - `idle`        — Nothing in flight.
 * - `submitting`  — Transaction has been signed and accepted by the RPC node
 *                   but is not yet included in a closed ledger. The scout's
 *                   payment is in-flight; do NOT treat this as confirmed.
 * - `confirming`  — Polling the RPC for ledger inclusion. Displayed to the
 *                   scout as "Confirming payment on-chain…".
 * - `confirmed`   — Transaction is included in a closed ledger; subscription
 *                   state has been revalidated via SWR mutate.
 * - `failed`      — Transaction was rejected by the contract (on-chain failure).
 * - `timeout`     — Polling exhausted MAX_ATTEMPTS without seeing the tx in a
 *                   closed ledger. The chain may still include it later; the
 *                   scout should check their wallet history before retrying.
 */
export type SubscribeStatus =
  | 'idle'
  | 'submitting'
  | 'confirming'
  | 'confirmed'
  | 'failed'
  | 'timeout';

export function useSubscription() {
  const { publicKey, signOnly } = useWallet();

  // Write-path loading and error are kept in local state because SWR only
  // manages read-path state. This preserves the original hook's API exactly.
  const [writeLoading, setWriteLoading] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [subscribeStatus, setSubscribeStatus] =
    useState<SubscribeStatus>('idle');

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
      dedupingInterval: SUBSCRIPTION_DEDUPING_INTERVAL_MS,
      revalidateOnFocus: false,
      errorRetryCount: SUBSCRIPTION_READ_ERROR_RETRY_COUNT,
    },
  );

  const submitGuarded = useSubmissionGuard<void>();

  /**
   * Purchase a subscription tier and wait for on-chain confirmation before
   * reporting success.
   *
   * The flow:
   *   1. useSubmissionGuard serialises concurrent calls — a fast double-click
   *      or any re-invocation while one purchase is in flight returns the same
   *      promise and never builds/signs/submits a second transaction.
   *   2. `signOnly` (not `signAndSubmit`) is passed as the signing callback
   *      to `contractSubscribe` → `signAndSubmitTx` in lib/stellar.ts.
   *      `signAndSubmitTx` handles submission + polling internally; passing
   *      `signAndSubmit` (which signs AND submits) would cause a double-submit
   *      because `signAndSubmitTx` would then try to parse the returned tx hash
   *      as an XDR string and re-submit it.
   *   3. `contractSubscribe` → `signAndSubmitTx` → `pollTransaction` blocks
   *      until the transaction is confirmed (SUCCESS), fails on-chain (FAILED),
   *      or the polling window is exhausted (timeout).
   *   4. SWR `mutate()` fires only after confirmed success — never at
   *      submission time — so the cached subscription state always reflects a
   *      real on-chain change.
   *
   * Callers can observe fine-grained progress via `subscribeStatus`:
   *   'idle' → 'submitting' → 'confirming' → 'confirmed' | 'failed' | 'timeout'
   */
  const subscribe = useCallback(
    (tier: SubscriptionTier) => {
      return submitGuarded(async () => {
        if (!publicKey) throw new Error('Wallet not connected');
        setWriteLoading(true);
        setWriteError(null);
        setSubscribeStatus('submitting');
        try {
          // contractSubscribe calls signAndSubmitTx which:
          //   1. calls signOnly(xdr) → returns signed XDR
          //   2. submits via rpc.sendTransaction → status changes to 'confirming'
          //   3. polls via pollTransaction until confirmed/failed/timeout
          //
          // We intercept the transition from submitting→confirming by wrapping
          // signOnly in a proxy that sets the status after signing (submission
          // is the next synchronous step inside signAndSubmitTx).
          const signOnlyWithStatusUpdate = async (
            xdr: string,
          ): Promise<string> => {
            const signed = await signOnly(xdr);
            // Signing succeeded → submission is about to happen; update status
            // so the UI can show "Confirming payment on-chain…" immediately.
            setSubscribeStatus('confirming');
            return signed;
          };

          await contractSubscribe(publicKey, tier, signOnlyWithStatusUpdate);

          // Revalidate the cached subscription so callers see the confirmed
          // on-chain state. This fires ONLY after pollTransaction succeeds.
          await mutate();
          setSubscribeStatus('confirmed');
        } catch (e: unknown) {
          if (e instanceof TransactionFailedError) {
            setSubscribeStatus('failed');
            setWriteError('Payment was rejected on-chain. Please try again.');
          } else if (e instanceof TransactionTimeoutError) {
            setSubscribeStatus('timeout');
            setWriteError(
              'Payment confirmation timed out. Check your wallet history before retrying to avoid a duplicate charge.',
            );
          } else {
            setSubscribeStatus('failed');
            setWriteError(e instanceof Error ? e.message : String(e));
          }
          throw e;
        } finally {
          setWriteLoading(false);
        }
      });
    },
    [submitGuarded, publicKey, signOnly, mutate],
  );

  const isExpired = subscription
    ? subscription.expiresAt < Date.now() / MILLISECONDS_PER_SECOND
    : false;

  /** True while the subscription purchase is in flight (submitting or confirming). */
  const isConfirming =
    subscribeStatus === 'submitting' || subscribeStatus === 'confirming';

  return {
    subscription: subscription ?? null,
    isExpired,
    subscribe,
    subscribeStatus,
    isConfirming,
    loading: isValidating || writeLoading,
    error:
      writeError ??
      (readError
        ? readError instanceof Error
          ? readError.message
          : String(readError)
        : null),
  };
}
