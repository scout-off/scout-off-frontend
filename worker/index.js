/**
 * Custom service worker source for next-pwa's "custom worker" build
 * (https://github.com/shadowwalker/next-pwa#custom-worker). When a file
 * exists at `worker/index.js` (this file), next-pwa compiles it with
 * webpack (target: webworker) into its own chunk and automatically
 * `importScripts`s it into the generated `public/sw.js`, ahead of
 * Workbox's own precaching/routing setup — no next.config.js changes are
 * needed beyond having next-pwa configured, which this project already
 * does (see next.config.js's `withPWA`).
 *
 * This is the always-loaded home for:
 *  - the player-onboarding-wizard background sync (issue #1181): finishing
 *    a *signed* registration transaction's broadcast to Soroban RPC even
 *    after the tab — or the whole installed PWA — has been closed,
 *  - the pre-existing generic offline-queue sync relay, wired in here via
 *    importScripts since public/sw-offline-queue.js was previously never
 *    reachable by the generated service worker at all (see that file's
 *    header comment, updated alongside this change), and
 *  - the Web Push `push` / `notificationclick` handlers (issue #1666).
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
  getSyncableSubmissions,
  updateOnboardingSubmission,
} from '../lib/onboardingSyncStore';
import { submitSignedTransaction, isNetworkError } from '../lib/sorobanRpc';

// Wires in the generic offline-queue-sync relay (see that file for details).
self.importScripts('/sw-offline-queue.js');

var ONBOARDING_SYNC_TAG = 'onboarding-sync';
var APPROVAL_SYNC_TAG = 'validator-approval-sync';

/** Tells every open tab about an onboarding-sync outcome. */
async function notifyClients(message) {
  var clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(function (client) {
    client.postMessage(message);
  });
}

/**
 * Best-effort native notification. This app has no push-subscription
 * infrastructure and never calls `Notification.requestPermission()`
 * anywhere (hooks/useNotifications.ts only derives in-app notifications
 * from indexer events) — so `Notification.permission` will almost always
 * be 'default' here, and this intentionally no-ops in that case rather
 * than prompting for permission itself. If some future change in this app
 * does start requesting notification permission, completed background
 * syncs pick it up automatically. Either way, the IndexedDB `status:
 * 'complete'` write in processOnboardingSync is the real notification —
 * the wizard checks it on next open and shows the player their registered
 * profile instead of a stale "still pending" state.
 */
async function notifyCompletion(submission) {
  try {
    if (
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted'
    ) {
      return;
    }
    var name =
      submission.vitals && submission.vitals.name
        ? submission.vitals.name
        : 'Your';
    await self.registration.showNotification('Registration complete', {
      body: name + '’s player profile is now live on-chain.',
      tag: 'onboarding-sync-' + submission.wallet,
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
async function processOnboardingSync() {
  var submissions = await getSyncableSubmissions();
  if (submissions.length === 0) return;

  var hadNetworkFailure = false;

  for (var i = 0; i < submissions.length; i++) {
    var submission = submissions[i];
    await updateOnboardingSubmission(submission.wallet, {
      status: 'syncing',
      retryCount: submission.retryCount + 1,
    });

    try {
      var result = await submitSignedTransaction(submission.signedXdr);
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
      var message = err && err.message ? err.message : String(err);
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

self.addEventListener('sync', function (event) {
  if (event.tag === ONBOARDING_SYNC_TAG) {
    event.waitUntil(processOnboardingSync());
  }
  if (event.tag === APPROVAL_SYNC_TAG) {
    // Wallet extensions are only available in a page. Wake open validator
    // tabs so the explicit batch-sign action can present one confirmation.
    event.waitUntil(notifyClients({ type: 'APPROVAL_SYNC_READY' }));
  }
});

// In-tab fallback for browsers without the Background Sync API (Safari, at
// time of writing): hooks/useOnboardingSync.ts posts this message instead
// of calling `registration.sync.register()` when `'sync' in registration`
// is false, so the SW still does the actual broadcast — the only
// difference is *when* it runs (only while a tab is open and 'online'
// fires) rather than truly in the background.
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'TRY_ONBOARDING_SYNC') {
    event.waitUntil(processOnboardingSync().catch(function () {}));
  } else if (event.data && event.data.type === 'CLEAR_USER_CACHES') {
    event.waitUntil(
      caches.keys().then(function (cacheNames) {
        return Promise.all(
          cacheNames.map(function (cacheName) {
            if (
              cacheName === 'api-cache' ||
              cacheName.includes('api') ||
              cacheName.includes('player-scout')
            ) {
              return caches.delete(cacheName);
            }
          }),
        );
      }),
    );
  }
});

// ── Web Push (issue #1666) ─────────────────────────────────────────────────
// The backend (POST /push/subscriptions) sends a VAPID-signed push whose
// JSON payload carries a *message key* and params — never English text and
// never contact details — e.g.
//   { type: 'milestone_approved', messageKey: 'push.milestoneApproved',
//     params: { milestone: 'Goals' }, url: '/players/abc' }
// The service worker localizes the key here so the same payload works for
// every locale the user has selected.

var PUSH_MESSAGES = {
  'push.milestoneApproved': {
    title: 'Milestone approved',
    body: 'Your milestone “{milestone}” was approved.',
  },
  'push.playerContacted': {
    title: 'A scout contacted you',
    body: 'A scout reached out about your profile.',
  },
  'push.disputeUpdate': {
    title: 'Dispute update',
    body: 'There is an update on your dispute.',
  },
  'push.subscriptionExpiring': {
    title: 'Subscription expiring',
    body: 'Your subscription expires soon — renew to keep access.',
  },
};

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, function (match, key) {
    return params[key] != null ? String(params[key]) : match;
  });
}

function localizePush(payload) {
  var key = payload && payload.messageKey;
  var entry = (key && PUSH_MESSAGES[key]) || null;
  if (!entry) {
    return { title: 'Player Scout', body: '' };
  }
  return {
    title: entry.title,
    body: interpolate(entry.body, payload.params),
  };
}

self.addEventListener('push', function (event) {
  var payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  var localized = localizePush(payload);
  var tag = payload.tag || payload.type || 'push';
  var url = typeof payload.url === 'string' ? payload.url : '/';

  event.waitUntil(
    self.registration.showNotification(localized.title, {
      body: localized.body,
      tag: tag,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      data: { url: url },
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var targetUrl =
    (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if ('focus' in client) {
            if (client.url === targetUrl) return client.focus();
            if ('navigate' in client) {
              return client.navigate(targetUrl).then(function (c) {
                return c && 'focus' in c ? c.focus() : undefined;
              });
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
