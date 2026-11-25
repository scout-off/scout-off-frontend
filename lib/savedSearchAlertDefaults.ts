import type { SavedSearchAlertPreferences } from '@/types';

/** Saved-search match alerts default to on, delivered instantly (issue #1705). */
export const DEFAULT_SAVED_SEARCH_ALERT_PREFERENCES: SavedSearchAlertPreferences =
  { enabled: true, delivery: 'instant' };
