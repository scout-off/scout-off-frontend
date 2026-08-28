'use client';
import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/components/ui/Toast';
import { useSubmissionGuard } from '@/hooks/useSubmissionGuard';
import {
  payToContact,
  getSubscription,
  PLATFORM_CONTACT_FEE_XLM,
} from '@/lib/contract';
import { checkFraudThrottle } from '@/lib/api';
import { parseContractError } from '@/lib/contractErrorMessage';
import { isBlockedByCounterpart } from '@/lib/messaging/moderation';
import {
  cacheContactDetails,
  contactDetailsKey,
  purgeContactDetails,
} from '@/lib/contactDetailsCache';
import type { ContactDetails } from '@/types';

/**
 * Pays to unlock a player's contact details and exposes the result through
 * a session-bounded, non-persistent cache. See
 * docs/contact-details-privacy.md and lib/contactDetailsCache.ts for the
 * storage policy this hook enforces — contact details never touch
 * localStorage/IndexedDB, live only in SWR's in-memory cache, and are
 * purged automatically after CONTACT_DETAILS_TTL_MS or immediately on
 * wallet disconnect.
 *
 * `contactDetails` is keyed by (playerId, scout wallet), so any component
 * that calls this hook for the same player — e.g. ContactModal rendered
 * alongside the caller that triggered unlock() — reads the same cache
 * entry without needing to unlock again.
 */
export function usePayToContact(playerId: string) {
  const { publicKey, signOnly, xlmBalance, refreshBalance } = useWallet();
  const { show } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = publicKey ? contactDetailsKey(playerId, publicKey) : null;

  // No fetcher: this key is populated only by unlock() below via
  // cacheContactDetails(), never auto-fetched/revalidated by SWR — there is
  // no re-fetchable GET for already-unlocked PII, only the one-time
  // on-chain pay_to_contact call.
  const { data: contactDetails } = useSWR<ContactDetails>(key, null, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    revalidateOnReconnect: false,
  });

  const submitGuarded = useSubmissionGuard<ContactDetails | undefined>();

  // Wraps the entire build/sign/submit attempt in useSubmissionGuard's
  // in-flight mutex (issue #1177) — a fast double-click or any re-invocation
  // of unlock() while one is already pending returns the SAME in-flight
  // promise instead of building/signing/submitting a second payToContact
  // transaction. See docs/payment-idempotency.md for what this does and
  // doesn't guarantee.
  const unlock = useCallback((): Promise<ContactDetails | undefined> => {
    return submitGuarded(async () => {
      function fail(msg: string): void {
        setError(msg);
        show({ message: msg, variant: 'error' });
      }

      if (!publicKey) {
        fail('Wallet not connected.');
        return undefined;
      }

      setLoading(true);
      setError(null);

      try {
        // ── 1. Block gate ────────────────────────────────────────────────────
        // pay_to_contact is submitted directly to the chain (lib/contract.ts)
        // and never touches the chat API, so it bypasses the block check that
        // stops blocked users from messaging — this is the only place that
        // check can happen before an unlock (and its fee) goes through.
        if (await isBlockedByCounterpart(playerId)) {
          fail('This player is not accepting new contact requests.');
          return undefined;
        }

        // ── 2. Subscription gate ────────────────────────────────────────────
        const subscription = await getSubscription(publicKey);
        const now = Date.now() / 1000;
        if (!subscription || subscription.expiresAt < now) {
          fail(
            'An active subscription is required to contact players. Please subscribe or renew.',
          );
          return undefined;
        }

        // ── 3. Balance gate ─────────────────────────────────────────────────
        const balance = parseFloat(xlmBalance ?? '0');
        if (balance < PLATFORM_CONTACT_FEE_XLM) {
          fail(
            `Insufficient XLM. You need at least ${PLATFORM_CONTACT_FEE_XLM} XLM to contact this player.`,
          );
          return undefined;
        }

        // ── 4. Sign, submit, and cache the result ───────────────────────────
        const details = await payToContact(publicKey, playerId, signOnly);
        await refreshBalance();
        await cacheContactDetails(
          contactDetailsKey(playerId, publicKey),
          details,
        );
        return details;
      } catch (e: any) {
        fail(parseContractError(e));
        throw e;
      } finally {
        setLoading(false);
      }
    });
  }, [
    submitGuarded,
    publicKey,
    playerId,
    xlmBalance,
    signOnly,
    refreshBalance,
    show,
  ]);

  /** Purges this player's cached contact details immediately. */
  const clear = useCallback(() => {
    if (!key) return;
    purgeContactDetails(key);
  }, [key]);

  return { unlock, contactDetails, loading, error, clear };
}
