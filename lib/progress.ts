import type { ProgressLevel } from '@/types';

export interface ProgressLevelInfo {
  level: ProgressLevel;
  label: string;
  /** Short name used for badge display. */
  badgeLabel: string;
  color: string;
}

export const PROGRESS_LEVELS: ProgressLevelInfo[] = [
  {
    level: 0,
    label: 'Unverified',
    badgeLabel: 'Unverified',
    color: 'bg-gray-600',
  },
  {
    level: 1,
    label: 'Verified Identity',
    badgeLabel: 'Verified',
    color: 'bg-blue-400',
  },
  {
    level: 2,
    label: 'Performance Milestones',
    badgeLabel: 'Performance',
    color: 'bg-amber-400',
  },
  {
    level: 3,
    label: 'Elite Tier',
    badgeLabel: 'Elite',
    color: 'bg-emerald-400',
  },
];

export function getProgressLabel(level: number): string {
  return PROGRESS_LEVELS[level]?.label ?? 'Unknown';
}

/** Returns the short badge label for a progress level (e.g. "Elite" instead of "Elite Tier"). */
export function getProgressBadgeLabel(level: number): string {
  return PROGRESS_LEVELS[level]?.badgeLabel ?? 'Unknown';
}

export function getProgressColor(level: number): string {
  return PROGRESS_LEVELS[level]?.color ?? 'bg-gray-600';
}
