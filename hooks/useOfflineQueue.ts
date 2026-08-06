'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  enqueueAction,
  processQueue,
  getQueueLength,
  registerHandler,
  type QueuedAction,
  type QueueStatus,
} from '@/lib/offlineQueue';

/**
 * useOfflineQueue — React hook for IndexedDB-backed offline form submissions.
 *
 * Provides:
 *   - `enqueue(type, payload)` — persist an action for later retry
 *   - `status` — 'idle' | 'processing' | 'queued'
 *   - `pendingCount` — number of actions waiting to be processed
 *   - `registerHandler(type, fn)` — register a handler for an action type
 *
 * Automatically retries queued actions when the browser comes back online.
 */
export function useOfflineQueue() {
  const [status, setStatus] = useState<QueueStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getQueueLength();
      if (mountedRef.current) {
        setPendingCount(count);
        setStatus(count > 0 ? 'queued' : 'idle');
      }
    } catch {
      // IndexedDB might not be available
    }
  }, []);

  /**
   * Process the queue — called when connectivity is restored.
   */
  const processAll = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      if (mountedRef.current) setStatus('processing');
      await processQueue();
    } catch {
      // Individual action errors are caught inside processQueue
    } finally {
      processingRef.current = false;
      await refreshPendingCount();
    }
  }, [refreshPendingCount]);

  /**
   * Enqueue a new action. If online, attempts to process immediately.
   */
  const enqueue = useCallback(
    async (type: string, payload: unknown): Promise<string> => {
      const id = await enqueueAction(type, payload);
      await refreshPendingCount();

      // If online, try to process right away
      if (navigator.onLine) {
        processAll();
      }

      return id;
    },
    [refreshPendingCount, processAll],
  );

  // ── Effects ─────────────────────────────────────────────────────────────

  // Check for pending items on mount
  useEffect(() => {
    mountedRef.current = true;
    refreshPendingCount();

    return () => {
      mountedRef.current = false;
    };
  }, [refreshPendingCount]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      processAll();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', () => {
      if (mountedRef.current) {
        setStatus('queued');
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', () => {});
    };
  }, [processAll]);

  // Attempt to register background sync if available
  useEffect(() => {
    if ('serviceWorker' in navigator && 'sync' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        const syncRegistration = registration as ServiceWorkerRegistration & {
          sync: { register(tag: string): Promise<void> };
        };
        syncRegistration.sync.register('offline-queue-sync').catch(() => {
          // Background sync not supported — fall back to online event
        });
      });
    }

    // Listen for PROCESS_OFFLINE_QUEUE messages from the service worker
    // (sent when a background sync event fires).
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PROCESS_OFFLINE_QUEUE') {
        processAll();
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      }
    };
  }, [processAll]);

  // Also try to process on mount (in case actions were queued during a
  // previous session and connectivity has since been restored)
  useEffect(() => {
    if (navigator.onLine) {
      processAll();
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    enqueue,
    status,
    pendingCount,
    processAll,
    registerHandler,
    refreshPendingCount,
  };
}

// ── Convenience: register handler outside a component ────────────────────────

export { registerHandler } from '@/lib/offlineQueue';
export type { QueuedAction, QueueStatus };
