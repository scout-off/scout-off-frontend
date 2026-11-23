'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '@/lib/notificationPreferencesClient';
import type { NotificationPreferences } from '@/types';

/** SWR key for the current wallet's notification preferences cache. */
export function notificationPreferencesKey(
  wallet: string | null,
): string | null {
  return wallet ? `notification-preferences:${wallet}` : null;
}

/**
 * Tracks the authenticated wallet's notification category preferences
 * (issue #560). Updates are optimistic — the toggle flips immediately and
 * rolls back only if the PUT fails.
 */
export function useNotificationPreferences(wallet: string | null) {
  const { data, error, isValidating, mutate } = useSWR<NotificationPreferences>(
    notificationPreferencesKey(wallet),
    fetchNotificationPreferences,
    {
      dedupingInterval: 15_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const preferences = data ?? DEFAULT_NOTIFICATION_PREFERENCES;

  const update = useCallback(
    async (next: NotificationPreferences) => {
      const previous = preferences;
      mutate(next, false);
      try {
        const saved = await updateNotificationPreferences(next);
        mutate(saved, false);
      } catch (err) {
        mutate(previous, false);
        throw err;
      }
    },
    [preferences, mutate],
  );

  return {
    preferences,
    loading: isValidating && !data,
    error: error?.message ?? null,
    update,
  };
}
