/**
 * Service worker source, compiled by Serwist (`@serwist/next`, configured in
 * next.config.js) into `public/sw.js` at build time (issue #1712 — this
 * replaced the unmaintained next-pwa "custom worker" setup).
 *
 * Serwist bundles this file with webpack (target: webworker), injects the
 * precache manifest as `self.__SW_MANIFEST`, and the client-side registration
 * it injects exposes `window.serwist` (used by hooks/useServiceWorkerUpdate.ts
 * for the update banner).
 *
 * This is the always-loaded home for:
 *  - precaching plus the runtime caching rules from lib/pwaCacheConfig.ts,
 *  - the offline fallback document for failed navigations (issue #1513),
 *  - the player-onboarding-wizard background sync (issue #1181): finishing
 *    a *signed* registration transaction's broadcast to Soroban RPC even
 *    after the tab — or the whole installed PWA — has been closed,
 *  - the validator approval sync wake-up,
 *  - the generic offline-queue sync relay in public/sw-offline-queue.js,
 *    loaded through Serwist's `importScripts` option, and
 *  - per-user cache clearing on wallet switch (CLEAR_USER_CACHES message
 *    sent by lib/pwaCacheConfig.ts's clearUserCaches).
 *
 * Note on why a *signed* transaction is what gets queued, not the raw form
 * data: registration is a Soroban smart-contract call, and signing it
 * happens locally via the player's wallet extension (Freighter, etc.) —
 * that step needs no network and cannot happen without the private key, so
 * it cannot run from a service worker. What *does* fail on a flaky mobile
 * connection is the network round-trip that follows signing: broadcasting
 * the already-signed envelope to the RPC node. That's the part a signed,
 * base64 XDR string is sufficient to retry — no key material required —
 * which is exactly what background sync is good for.
 */

import {
  CacheFirst,
  CacheOnly,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
  type RuntimeCaching,
  type SerwistGlobalConfig,
} from 'serwist';
import { tunedRuntimeCaching } from '../lib/pwaCacheConfig';
import {
  getSyncableSubmissions,
  updateOnboardingSubmission,
  type PendingOnboardingSubmission,
} from '../lib/onboardingSyncStore';
import { submitSignedTransaction, isNetworkError } from '../lib/sorobanRpc';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}

const ONBOARDING_SYNC_TAG = 'onboarding-sync';
const APPROVAL_SYNC_TAG = 'validator-approval-sync';
const OFFLINE_FALLBACK_URL = '/offline.html';

// ── Precache + runtime caching ─────────────────────────────────────────────

const STRATEGIES = {
  CacheFirst,
  CacheOnly,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
};

/** Translates the declarative rules in lib/pwaCacheConfig.ts to Serwist routes. */
const runtimeCaching: RuntimeCaching[] = tunedRuntimeCaching.map(
  ({ urlPattern, handler, options }) => {
    const Strategy = STRATEGIES[handler];
    const plugins = options?.expiration
      ? [new ExpirationPlugin(options.expiration)]
      : [];
    return {
      matcher:
        typeof urlPattern === 'string'
          ? ({ url }) => url.href.startsWith(urlPattern)
          : urlPattern,
      handler: new Strategy({ cacheName: options?.cacheName, plugins }),
    };
  },
);

// Navigations are never cached (they can contain personal data), but they
// need a route so a failure while offline falls back to OFFLINE_FALLBACK_URL.
runtimeCaching.push({
  matcher: ({ request }) => request.mode === 'navigate',
  handler: new NetworkOnly(),
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Keep `false`: an unconditional skipWaiting() activates every new build
  // immediately, so the service worker never enters the "waiting" state the
  // reload prompt (components/ServiceWorkerUpdateBanner.tsx) depends on to
  // detect updates. With this off, Serwist installs a SKIP_WAITING message
  // listener instead, and the banner's "Reload" button triggers it.
  skipWaiting: false,
  clientsClaim: true,
  runtimeCaching,
  // Offline fallback document for navigation requests that fail while the
  // device has no network (issue #1513). public/offline.html is precached.
  fallbacks: {
    entries: [
      {
        url: OFFLINE_FALLBACK_URL,
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
  // Generic offline-queue sync relay (see that file for details).
  importScripts: ['/sw-offline-queue.js'],
});

serwist.addEventListeners();

// ── Onboarding background sync (issue #1181) ───────────────────────────────

/** Tells every open tab about an onboarding-sync outcome. */
async function notifyClients(message: Record<string, unknown>): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => client.postMessage(message));
}

/**
 * Best-effort native notification. This intentionally no-ops unless
 * notification permission was already granted (it is only ever requested
 * from the explicit push opt-in in components/PushNotificationToggle.tsx).
 * Either way, the IndexedDB `status: 'complete'` write in
 * processOnboardingSync is the real notification — the wizard checks it on
 * next open and shows the player their registered profile instead of a
 * stale "still pending" state.
 */
async function notifyCompletion(
  submission: PendingOnboardingSubmission,
): Promise<void> {
  try {
    if (
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted'
    ) {
      return;
    }
    const name = submission.vitals?.name ? submission.vitals.name : 'Your';
    await self.registration.showNotification('Registration complete', {
      body: `${name}’s player profile is now live on-chain.`,
      tag: `onboarding-sync-${submission.wallet}`,
      icon: '/icons/icon-192x192.png',
    });
  } catch {
    // Notifications are a nice-to-have here — never let a failure here
    // affect the sync result itself.
  }
}

/**
 * Broadcasts every syncable queued onboarding submission on this device.
 *
 * A submission that fails for a network-shaped reason is put back to
 * 'pending' (so the next sync attempt picks it up again) and this function
 * throws once at the end — rejecting the promise handed to
 * `event.waitUntil()` is what tells the browser to reschedule another
 * `sync` event for this tag later, per the Background Sync spec, rather
 * than this code re-implementing its own retry/backoff loop.
 *
 * A submission rejected by the network itself (a genuine contract-level
 * rejection, not a connectivity problem) is marked 'failed' and is not
 * retried — resubmitting the same signed XDR would never succeed.
 */
async function processOnboardingSync(): Promise<void> {
  const submissions = await getSyncableSubmissions();
  if (submissions.length === 0) return;

  let hadNetworkFailure = false;

  for (const submission of submissions) {
    await updateOnboardingSubmission(submission.wallet, {
      status: 'syncing',
      retryCount: submission.retryCount + 1,
    });

    try {
      const result = await submitSignedTransaction(submission.signedXdr);
      await updateOnboardingSubmission(submission.wallet, {
        status: 'complete',
        txHash: result.hash,
      });
      await notifyClients({
        type: 'ONBOARDING_SYNC_COMPLETE',
        wallet: submission.wallet,
        txHash: result.hash,
      });
      await notifyCompletion(submission);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isNetworkError(err)) {
        hadNetworkFailure = true;
        await updateOnboardingSubmission(submission.wallet, {
          status: 'pending',
          lastError: message,
        });
      } else {
        await updateOnboardingSubmission(submission.wallet, {
          status: 'failed',
          lastError: message,
        });
        await notifyClients({
          type: 'ONBOARDING_SYNC_FAILED',
          wallet: submission.wallet,
          error: message,
        });
      }
    }
  }

  if (hadNetworkFailure) {
    throw new Error(
      'One or more onboarding submissions could not be broadcast — will retry',
    );
  }
}

self.addEventListener('sync', ((event: SyncEvent) => {
  if (event.tag === ONBOARDING_SYNC_TAG) {
    event.waitUntil(processOnboardingSync());
  }
  if (event.tag === APPROVAL_SYNC_TAG) {
    // Wallet extensions are only available in a page. Wake open validator
    // tabs so the explicit batch-sign action can present one confirmation.
    event.waitUntil(notifyClients({ type: 'APPROVAL_SYNC_READY' }));
  }
}) as EventListener);

// In-tab fallback for browsers without the Background Sync API (Safari, at
// time of writing): hooks/useOnboardingSync.ts posts this message instead
// of calling `registration.sync.register()` when `'sync' in registration`
// is false, so the SW still does the actual broadcast — the only
// difference is *when* it runs (only while a tab is open and 'online'
// fires) rather than truly in the background.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'TRY_ONBOARDING_SYNC') {
    event.waitUntil(processOnboardingSync().catch(() => {}));
  } else if (event.data?.type === 'CLEAR_USER_CACHES') {
    // Sent by clearUserCaches() on wallet disconnect / account switch.
    event.waitUntil(
      caches
        .keys()
        .then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter(
                (name) =>
                  name === 'api-cache' ||
                  name.includes('api') ||
                  name.includes('player-scout'),
              )
              .map((name) => caches.delete(name)),
          ),
        ),
    );
  }
});

// ── Milestone-approval Web Push (issue #558) ───────────────────────────────
// The backend sends a VAPID-signed push with a JSON payload shaped like
// `{ type: 'milestone_approved', playerId, milestone, validatorName? }` to
// subscriptions registered via components/PushNotificationToggle.tsx.
// Permission is only ever requested from that explicit opt-in button.
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  playerId?: string;
  milestone?: string;
  milestoneDescription?: string;
  milestoneId?: string;
  validatorName?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const milestone = data.milestone || data.milestoneDescription || '';
  const approver = data.validatorName ? ` by ${data.validatorName}` : '';
  const title = data.title || 'Milestone approved';
  const body =
    data.body ||
    (milestone
      ? `“${milestone}” was approved${approver}.`
      : `One of your milestones was approved${approver}.`);
  const url = data.url || (data.playerId ? `/player/${data.playerId}` : '/');

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: `milestone-${data.milestoneId || data.playerId || 'approved'}`,
      icon: '/icons/icon-192x192.png',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || '/',
    self.location.origin,
  ).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if (client.url === target && 'focus' in client) return client.focus();
      }
      for (const client of clients) {
        if ('navigate' in client) {
          await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
