'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import {
  fetchSavedSearchAlertPreferences,
  updateSavedSearchAlertPreferences,
} from '@/lib/notificationPreferencesClient';
import { DEFAULT_SAVED_SEARCH_ALERT_PREFERENCES } from '@/lib/savedSearchAlertDefaults';
import type { SavedSearchAlertPreferences } from '@/types';

/** The scout's `saved_search_matches` preference (issue #1705), persisted server-side. */
export function useSavedSearchAlertPreferences(wallet: string | null) {
  const { data, isValidating, mutate } = useSWR<SavedSearchAlertPreferences>(
    wallet ? `saved-search-alert-preferences:${wallet}` : null,
    fetchSavedSearchAlertPreferences,
    { revalidateOnFocus: false, errorRetryCount: 2 },
  );

  const update = useCallback(
    async (next: SavedSearchAlertPreferences) => {
      mutate(next, false);
      try {
        mutate(await updateSavedSearchAlertPreferences(next), false);
      } catch (err) {
        mutate();
        throw err;
      }
    },
    [mutate],
  );

  return {
    preferences: data ?? DEFAULT_SAVED_SEARCH_ALERT_PREFERENCES,
    loading: isValidating && data === undefined && wallet !== null,
    update,
  };
}
