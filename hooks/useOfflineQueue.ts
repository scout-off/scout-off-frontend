'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  enqueueAction,
  processQueue,
  getQueueLength,
  getFailedActions,
  getFailedCount,
  discardFailedAction,
  discardAllFailedActions,
  registerHandler,
  type QueuedAction,
  type FailedAction,
  type QueueStatus,
} from '@/lib/offlineQueue';

/**
 * useOfflineQueue — React hook for IndexedDB-backed offline form submissions.
 *
 * Provides:
 *   - `enqueue(type, payload)` — persist an action for later retry
 *   - `status` — 'idle' | 'processing' | 'queued'
 *   - `pendingCount` — number of actions waiting to be processed
 *   - `failedActions` — dead-lettered actions that need user attention
 *   - `failedCount` — number of dead-lettered actions
 *   - `conflictActions` — the subset of `failedActions` that were dead-lettered
 *     because the server detected a conflict (a since-changed record), as
 *     opposed to a validation or exhausted-retry failure — see issue #1178
 *   - `conflictCount` — number of conflicted actions
 *   - `discardFailed(id)` — remove a single dead-lettered action (also used
 *     to acknowledge/dismiss a conflict once the user has reviewed it)
 *   - `discardAllFailed()` — remove all dead-lettered actions
 *   - `processAll()` — manually trigger queue processing
 *   - `registerHandler(type, fn)` — register a handler for an action type
 *   - `refreshPendingCount()` — manually re-fetch the pending count
 *
 * Automatically retries queued actions when the browser comes back online.
 */
export function useOfflineQueue() {
  const [status, setStatus] = useState<QueueStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [failedActions, setFailedActions] = useState<FailedAction[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);

  /** Failed actions that were dead-lettered due to a server-detected conflict (issue #1178). */
  const conflictActions = useMemo(
    () => failedActions.filter((action) => action.conflict === true),
    [failedActions],
  );
  const conflictCount = conflictActions.length;

  const refreshCounts = useCallback(async () => {
    try {
      const [count, failed] = await Promise.all([
        getQueueLength(),
        getFailedActions(),
      ]);
      if (mountedRef.current) {
        setPendingCount(count);
        setStatus(count > 0 ? 'queued' : 'idle');
        setFailedActions(failed);
        setFailedCount(failed.length);
      }
    } catch {
      // IndexedDB might not be available (e.g. private browsing in some browsers)
    }
  }, []);

  /**
   * @deprecated Use `refreshCounts` — kept for backwards compatibility.
   */
  const refreshPendingCount = refreshCounts;

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
      // Individual action errors are handled inside processQueue
    } finally {
      processingRef.current = false;
      await refreshCounts();
    }
  }, [refreshCounts]);

  /**
   * Enqueue a new action. If online, attempts to process immediately.
   *
   * Pass `options.baseVersion` when the action targets a versioned record
   * (e.g. its current `updatedAt`) so a conflict can be detected if the
   * record changes elsewhere before this action flushes — see issue #1178.
   */
  const enqueue = useCallback(
    async (
      type: string,
      payload: unknown,
      options?: { baseVersion?: number },
    ): Promise<string> => {
      const id = await enqueueAction(type, payload, options);
      await refreshCounts();

      // If online, try to process right away
      if (navigator.onLine) {
        processAll();
      }

      return id;
    },
    [refreshCounts, processAll],
  );

  /**
   * Discard a single dead-lettered action by id.
   */
  const discardFailed = useCallback(
    async (id: string): Promise<void> => {
      await discardFailedAction(id);
      await refreshCounts();
    },
    [refreshCounts],
  );

  /**
   * Discard all dead-lettered actions.
   */
  const discardAllFailed = useCallback(async (): Promise<void> => {
    await discardAllFailedActions();
    await refreshCounts();
  }, [refreshCounts]);

  // ── Effects ─────────────────────────────────────────────────────────────

  // Initialise counts on mount
  useEffect(() => {
    mountedRef.current = true;
    refreshCounts();

    return () => {
      mountedRef.current = false;
    };
  }, [refreshCounts]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      processAll();
    };
    const handleOffline = () => {
      if (mountedRef.current) {
        setStatus('queued');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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

  // Poll for queue updates to keep UI fresh (e.g. when items complete while
  // mounted but before the next manual refreshCounts() call)
  useEffect(() => {
    const pollIntervalMs = 2_000; // 2 seconds is reasonable for this UX
    const poll = async () => {
      // Only poll when we're in a state that might change
      if (status === 'processing' || pendingCount > 0 || failedCount > 0) {
        await refreshCounts();
      }
    };

    const intervalId = setInterval(poll, pollIntervalMs);
    poll(); // Initial poll immediately

    return () => clearInterval(intervalId);
  }, [status, pendingCount, failedCount, refreshCounts]);

  return {
    enqueue,
    status,
    pendingCount,
    failedActions,
    failedCount,
    conflictActions,
    conflictCount,
    discardFailed,
    discardAllFailed,
    processAll,
    registerHandler,
    refreshPendingCount,
    refreshCounts,
  };
}

// ── Convenience: register handler outside a component ────────────────────────

export { registerHandler } from '@/lib/offlineQueue';
export type { QueuedAction, FailedAction, QueueStatus };
