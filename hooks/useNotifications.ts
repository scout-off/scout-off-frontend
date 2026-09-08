'use client';

import { useCallback, useMemo } from 'react';
import useSWR from 'swr';
import {
  fetchReadNotificationIds,
  markNotificationsRead,
} from '@/lib/notificationsClient';
import {
  deriveNotifications,
  applyNotificationPreferences,
} from '@/lib/notifications';
import { useNotificationPreferences } from './useNotificationPreferences';
import { useIndexerEventCache } from './useIndexerEventCache';
import type { Notification } from '@/types';

/** SWR key for the current wallet's notification-center cache. */
export function notificationsKey(wallet: string | null): string | null {
  return wallet ? `notifications:${wallet}` : null;
}

/** SWR key for the server-persisted read-id set for a wallet. */
function readIdsKey(wallet: string | null): string | null {
  return wallet ? `notifications-read:${wallet}` : null;
}

/**
 * Drives the notification bell + panel (issue #557) and its unread badge
 * (issue #559): pulls recent wallet-relevant events from the shared indexer
 * event cache, overlays server-persisted read state, and filters by the
 * wallet's saved category preferences (issue #560).
 *
 * Events are sourced from useIndexerEventCache so concurrent consumers on
 * the same page share a single indexer fetch rather than firing independent
 * full scans (issue #1004).
 */
export function useNotifications(wallet: string | null) {
  const { preferences } = useNotificationPreferences(wallet);

  // Shared indexer event cache — no independent pagination loop here.
  const eventCache = useIndexerEventCache();

  // Separate SWR for server-persisted read IDs, keyed by wallet.
  const {
    data: readIds,
    error: readIdsError,
    isValidating: readIdsValidating,
    mutate: mutateReadIds,
  } = useSWR<number[]>(readIdsKey(wallet), fetchReadNotificationIds, {
    dedupingInterval: 15_000,
    revalidateOnFocus: false,
    refreshInterval: 60_000,
    errorRetryCount: 2,
    // Suppress fetch when there is no wallet — SWR only fetches for non-null keys
    // (readIdsKey already returns null when wallet is null).
  });

  // Derive notifications by combining the event cache with the read-id set.
  // useMemo keeps this stable across re-renders when neither input changes.
  const allNotifications = useMemo<Notification[]>(() => {
    if (!wallet) return [];
    const readSet = new Set(readIds ?? []);
    return deriveNotifications(eventCache.events, wallet).map((n) => ({
      ...n,
      read: readSet.has(n.id),
    }));
  }, [eventCache.events, readIds, wallet]);

  const notifications = applyNotificationPreferences(
    allNotifications,
    preferences,
  );
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Loading: true while either the event cache or read-ids haven't resolved yet.
  const loading =
    (eventCache.loading && !eventCache.events.length) ||
    (readIdsValidating && readIds === undefined && wallet !== null);

  // Surface the first error we encounter.
  const error = eventCache.error ?? readIdsError?.message ?? null;

  const markRead = useCallback(
    async (id: number) => {
      // Optimistic update: flip the targeted notification to read in-cache.
      mutateReadIds((current) => {
        const existing = current ?? [];
        return existing.includes(id) ? existing : [...existing, id];
      }, false);
      try {
        await markNotificationsRead([id]);
      } finally {
        // Re-validate to sync server state.
        mutateReadIds();
      }
    },
    [mutateReadIds],
  );

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    // Optimistic update: add all unread IDs to the read set.
    mutateReadIds((current) => {
      const existing = current ?? [];
      const toAdd = unreadIds.filter((id) => !existing.includes(id));
      return toAdd.length > 0 ? [...existing, ...toAdd] : existing;
    }, false);
    try {
      await markNotificationsRead(unreadIds);
    } finally {
      mutateReadIds();
    }
  }, [notifications, mutateReadIds]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markRead,
    markAllRead,
  };
}
