/**
 * Service worker — offline queue background sync handler.
 *
 * NOTE: Serwist builds the actual service worker (public/sw.js) from
 * worker/sw.ts at build time. That entry loads this file through Serwist's
 * `importScripts: ['/sw-offline-queue.js']` option (see worker/sw.ts).
 *
 * The `online` event listener in `useOfflineQueue.ts` remains the primary
 * path — queued actions are retried as soon as the browser detects
 * connectivity while a tab is open. The background-sync path below is an
 * additional path for cases the `online` event misses (e.g. waking from
 * sleep with connectivity already restored, or connectivity returning
 * while no tab is open at all).
 *
 * When the browser fires a 'sync' event for 'offline-queue-sync', it
 * posts a message to the client (the main thread) telling it to process
 * the offline queue. The client's useOfflineQueue hook listens for this
 * message and triggers processing.
 */

self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-queue-sync') {
    event.waitUntil(
      (async () => {
        // Notify all clients to process their queues
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          client.postMessage({ type: 'PROCESS_OFFLINE_QUEUE' });
        }
      })(),
    );
  }
});
