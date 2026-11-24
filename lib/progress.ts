import type { ProgressLevel } from '@/types';

export interface ProgressLevelInfo {
  level: ProgressLevel;
  /** i18n key suffix for the full label, e.g. 'level0_label'. Used with progress_levels namespace. */
  key: string;
  /** i18n key suffix for the short badge label, e.g. 'level0'. Used with progress_levels namespace. */
  badgeKey: string;
  color: string;
}

export const PROGRESS_LEVELS: ProgressLevelInfo[] = [
  { level: 0, key: 'level0_label', badgeKey: 'level0', color: 'bg-gray-600' },
  { level: 1, key: 'level1_label', badgeKey: 'level1', color: 'bg-blue-400' },
  { level: 2, key: 'level2_label', badgeKey: 'level2', color: 'bg-amber-400' },
  { level: 3, key: 'level3_label', badgeKey: 'level3', color: 'bg-emerald-400' },
];

/** English fallback labels for non-UI contexts (CSV exports, server logs). */
const FALLBACK_LABELS: Record<number, string> = {
  0: 'Unverified',
  1: 'Verified Identity',
  2: 'Performance Milestones',
  3: 'Elite Tier',
};

const FALLBACK_BADGE_LABELS: Record<number, string> = {
  0: 'Unverified',
  1: 'Verified',
  2: 'Performance',
  3: 'Elite',
};

/**
 * Returns the English label for a progress level.
 * Use only in non-UI contexts (CSV exports, stable machine-readable values).
 * For UI, use the i18n key via progress_levels namespace.
 */
export function getProgressLabel(level: number): string {
  return FALLBACK_LABELS[level] ?? 'Unknown';
}

/** Returns the English short badge label for a progress level. */
export function getProgressBadgeLabel(level: number): string {
  return FALLBACK_BADGE_LABELS[level] ?? 'Unknown';
}

export function getProgressColor(level: number): string {
  return PROGRESS_LEVELS[level]?.color ?? 'bg-gray-600';
}
