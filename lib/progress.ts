import type { ProgressLevel } from '@/types';

export interface ProgressLevelInfo {
  level: ProgressLevel;
  label: string;
  color: string;
}

export const PROGRESS_LEVELS: ProgressLevelInfo[] = [
  { level: 0, label: 'Unverified', color: 'bg-gray-600' },
  { level: 1, label: 'Verified Identity', color: 'bg-blue-400' },
  { level: 2, label: 'Performance Milestones', color: 'bg-amber-400' },
  { level: 3, label: 'Elite Tier', color: 'bg-emerald-400' },
];

export function getProgressLabel(level: number): string {
  return PROGRESS_LEVELS[level]?.label ?? 'Unknown';
}

export function getProgressColor(level: number): string {
  return PROGRESS_LEVELS[level]?.color ?? 'bg-gray-600';
}
