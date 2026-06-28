'use client';

/**
 * MilestoneList
 *
 * A flat, scrollable list of a player's approved milestones ordered
 * chronologically (oldest first). Each row includes:
 *   – Level badge
 *   – Milestone description
 *   – Date
 *   – ValidatorChip (active/former status + tooltip with milestone count)
 *
 * Used on profile pages where scouts need a compact milestone history without
 * the interactive timeline visualization.
 */

import type { Milestone, ProgressLevel } from '@/types';
import { PROGRESS_LABELS } from '@/types';
import Badge from '@/components/ui/Badge';
import ValidatorChip from '@/components/player/ValidatorChip';

const BADGE_VARIANT = ['level0', 'level1', 'level2', 'level3'] as const;

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface MilestoneListProps {
  milestones: Milestone[];
}

export default function MilestoneList({ milestones }: MilestoneListProps) {
  if (milestones.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4">No milestones approved yet.</p>
    );
  }

  const sorted = [...milestones].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <ol
      aria-label="Milestone history"
      className="flex flex-col divide-y divide-gray-800"
    >
      {sorted.map((milestone, idx) => {
        // Milestone index 0 → level 1, index 1 → level 2, etc.
        const level = Math.min(idx + 1, 3) as ProgressLevel;

        return (
          <li
            key={milestone.id}
            className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:gap-4"
          >
            {/* Level badge */}
            <div className="flex-shrink-0 pt-0.5">
              <Badge
                variant={BADGE_VARIANT[level]}
                label={PROGRESS_LABELS[level]}
                size="sm"
              />
            </div>

            {/* Content */}
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <p className="text-sm font-medium text-white leading-snug">
                {milestone.description}
              </p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {/* Validator reputation chip */}
                <ValidatorChip address={milestone.validator} />

                {/* Date */}
                <time
                  dateTime={new Date(milestone.timestamp * 1000).toISOString()}
                  className="text-xs text-gray-500"
                >
                  {formatDate(milestone.timestamp)}
                </time>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
