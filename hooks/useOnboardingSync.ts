'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  saveOnboardingSubmission,
  getOnboardingSubmission,
  updateOnboardingSubmission,
  deleteOnboardingSubmission,
  isIndexedDbAvailable,
  type PendingOnboardingSubmission,
} from '@/lib/onboardingSyncStore';
import { submitSignedTransaction, isNetworkError } from '@/lib/sorobanRpc';
import type { PlayerVitals } from '@/types';

const SYNC_TAG = 'onboarding-sync';

interface SyncManagerRegistration extends ServiceWorkerRegistration {
  sync: { register(tag: string): Promise<void> };
}

function supportsBackgroundSync(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'SyncManager' in window
  );
}

/**
 * Background-sync support for the onboarding wizard's final submit step
 * (issue #1181). Handles three layers, in preference order:
 *
 *  1. Best case — the browser supports the Background Sync API: the queued
 *     submission is persisted to IndexedDB and a `sync` event is
 *     registered. The service worker (worker/index.js) broadcasts it once
 *     connectivity returns, even if this tab (or the whole installed PWA)
 *     has since been closed.
 *  2. No Background Sync API (Safari, at time of writing), but a service
 *     worker is active: fall back to an in-tab `online` listener that asks
 *     the SW to attempt the broadcast via postMessage. Only works while a
 *     tab is open, but still keeps the broadcast logic in one place.
 *  3. No service worker at all (e.g. local dev, where next-pwa is disabled
 *     — see next.config.js) or it hasn't taken control yet: fall back
 *     further to retrying the broadcast directly from the main thread on
 *     the same `online` event.
 *
 * All three layers read/write the same IndexedDB record, so whichever one
 * actually completes the broadcast, the UI-facing state is consistent.
 */
export function useOnboardingSync(wallet: string | null) {
  const [submission, setSubmission] =
    useState<PendingOnboardingSubmission | null>(null);
  const [loaded, setLoaded] = useState(false);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  const refresh = useCallback(async () => {
    if (!wallet || !isIndexedDbAvailable()) {
      setSubmission(null);
      setLoaded(true);
      return;
    }
    try {
      const record = await getOnboardingSubmission(wallet);
      if (walletRef.current === wallet) {
        setSubmission(record);
      }
    } catch {
      // IndexedDB unavailable/broken (e.g. private browsing) — behave as
      // if nothing is queued; the wizard's normal online submit path is
      // unaffected either way.
      setSubmission(null);
    } finally {
      setLoaded(true);
    }
  }, [wallet]);

  // Load the current wallet's queued submission (if any) on mount / wallet change.
  useEffect(() => {
    setLoaded(false);
    refresh();
  }, [refresh]);

  /**
   * Retries broadcasting `wallet`'s queued submission directly from the
   * main thread. Used as the manual "Try now" affordance and as the
   * innermost fallback (layer 3 above) when no service worker is available
   * to hand the retry off to.
   */
  const retryNow = useCallback(async () => {
    if (!wallet) return;
    const record = await getOnboardingSubmission(wallet);
    if (!record || (record.status !== 'pending' && record.status !== 'failed'))
      return;

    await updateOnboardingSubmission(wallet, {
      status: 'syncing',
      retryCount: record.retryCount + 1,
    });
    await refresh();

    try {
      const result = await submitSignedTransaction(record.signedXdr);
      await updateOnboardingSubmission(wallet, {
        status: 'complete',
        txHash: result.hash,
      });
    } catch (err) {
      if (isNetworkError(err)) {
        await updateOnboardingSubmission(wallet, {
          status: 'pending',
          lastError: err instanceof Error ? err.message : String(err),
        });
      } else {
        await updateOnboardingSubmission(wallet, {
          status: 'failed',
          lastError: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      await refresh();
    }
  }, [wallet, refresh]);

  /**
   * Persists a freshly-signed submission whose broadcast just failed for a
   * network reason, and registers whatever sync mechanism this browser
   * supports so it completes automatically once connectivity returns.
   */
  const queueSubmission = useCallback(
    async (input: {
      vitals: PlayerVitals;
      ipfsHash: string;
      signedXdr: string;
    }) => {
      if (!wallet) return;
      const record = await saveOnboardingSubmission({ wallet, ...input });
      setSubmission(record);

      if (supportsBackgroundSync()) {
        try {
          const registration = (await navigator.serviceWorker
            .ready) as SyncManagerRegistration;
          await registration.sync.register(SYNC_TAG);
          return;
        } catch {
          // Registration itself can still fail (e.g. permission denied) —
          // fall through to the in-tab fallback below so the submission
          // isn't silently stranded.
        }
      }
      // Layers 2/3 are driven by the `online` listener below — nothing
      // further to do at queue time beyond having persisted the record.
    },
    [wallet],
  );

  const discard = useCallback(async () => {
    if (!wallet) return;
    await deleteOnboardingSubmission(wallet);
    setSubmission(null);
  }, [wallet]);

  // Layers 2 and 3: in-tab fallback for browsers/situations without a
  // working Background Sync registration.
  useEffect(() => {
    const handleOnline = async () => {
      const current = walletRef.current;
      if (!current) return;
      const record = await getOnboardingSubmission(current);
      if (!record || record.status !== 'pending') return;

      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'TRY_ONBOARDING_SYNC',
        });
      } else {
        retryNow();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [retryNow]);

  // React to the service worker announcing an onboarding sync outcome
  // (fired from worker/index.js's processOnboardingSync) — keeps the UI
  // live-updating without polling if the tab happens to be open when the
  // background sync actually completes.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; wallet?: string } | undefined;
      if (
        (data?.type === 'ONBOARDING_SYNC_COMPLETE' ||
          data?.type === 'ONBOARDING_SYNC_FAILED') &&
        data.wallet === walletRef.current
      ) {
        refresh();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () =>
      navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [refresh]);

  return {
    /** The current wallet's queued/complete/failed submission, or null. */
    submission,
    /** True once the initial IndexedDB lookup for this wallet has settled. */
    loaded,
    queueSubmission,
    retryNow,
    discard,
    refresh,
  };
}
