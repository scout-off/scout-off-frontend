'use client';

import { useState } from 'react';
import type { Milestone, ProgressLevel } from '@/types';
import { PROGRESS_LABELS } from '@/types';
import Badge from '@/components/ui/Badge';
import ValidatorChip from '@/components/player/ValidatorChip';

// Map each level to the ProgressBar colour tokens so nodes stay in sync.
const NODE_COLOUR: Record<ProgressLevel, string> = {
  0: 'bg-gray-600',
  1: 'bg-blue-400',
  2: 'bg-amber-400',
  3: 'bg-emerald-400',
};

const BADGE_VARIANT = ['level0', 'level1', 'level2', 'level3'] as const;

const LEVELS: ProgressLevel[] = [0, 1, 2, 3];

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Return the most-recent milestone for a given level (levels 1-3 map to index). */
function milestoneForLevel(
  milestones: Milestone[],
  level: ProgressLevel,
): Milestone | undefined {
  // Level 0 = profile created (no milestone record); levels 1-3 correspond
  // to the (level-1)th index when sorted chronologically.
  if (level === 0) return undefined;
  const sorted = [...milestones].sort((a, b) => a.timestamp - b.timestamp);
  return sorted[level - 1];
}

interface MilestoneTimelineProps {
  milestones: Milestone[];
  currentLevel: ProgressLevel;
}

export default function MilestoneTimeline({
  milestones,
  currentLevel,
}: MilestoneTimelineProps) {
  const [expanded, setExpanded] = useState<ProgressLevel | null>(null);

  function toggle(level: ProgressLevel) {
    setExpanded((prev) => (prev === level ? null : level));
  }

  return (
    // <ol> carries implicit list semantics; aria-label names the landmark so
    // screen readers announce "Level progression timeline, list" rather than
    // a bare "list".
    <ol
      aria-label="Level progression timeline"
      className="relative flex flex-col gap-0 sm:flex-row sm:items-start sm:gap-0"
    >
      {LEVELS.map((level, idx) => {
        const isCompleted = level <= currentLevel;
        const isCurrent = level === currentLevel;
        const isFuture = level > currentLevel;
        const milestone = milestoneForLevel(milestones, level);
        const isExpanded = expanded === level;
        const isLast = idx === LEVELS.length - 1;

        return (
          // Each <li> is a timeline entry. aria-label provides the full
          // accessible name so users scanning the list hear a meaningful
          // summary without having to enter the node.
          <li
            key={level}
            aria-label={
              isCompleted && milestone
                ? `${PROGRESS_LABELS[level]}, achieved ${formatDate(milestone.timestamp)}`
                : isCompleted
                  ? PROGRESS_LABELS[level]
                  : `${PROGRESS_LABELS[level]}, not yet reached`
            }
            className="relative flex flex-row items-start gap-3 pb-8 sm:flex-col sm:items-center sm:flex-1 sm:pb-0"
          >
            {/* Connector line — purely decorative, hidden from a11y tree. */}
            {!isLast && (
              <span
                aria-hidden="true"
                className={[
                  // mobile: left-side vertical line
                  'absolute left-4 top-8 w-0.5 bottom-0',
                  // sm: horizontal line from right edge of node area
                  'sm:left-1/2 sm:top-4 sm:bottom-auto sm:w-full sm:h-0.5 sm:translate-x-0',
                  isCompleted && level < currentLevel
                    ? 'bg-brand-green'
                    : 'bg-gray-700',
                ].join(' ')}
              />
            )}

            {/* Node button: expand/collapse the detail panel.
                aria-expanded + aria-controls wire it to the region below. */}
            <button
              type="button"
              onClick={() => toggle(level)}
              aria-expanded={isExpanded}
              aria-controls={`timeline-detail-${level}`}
              aria-label={`${PROGRESS_LABELS[level]}${milestone ? `, achieved ${formatDate(milestone.timestamp)}` : ''}. ${isExpanded ? 'Collapse' : 'Expand'} details`}
              className={[
                'relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green',
                isCompleted
                  ? NODE_COLOUR[level]
                  : 'bg-gray-800 border-2 border-gray-600',
              ].join(' ')}
            >
              {/* Pulsing ring — decorative animation, hidden from a11y tree. */}
              {isCurrent && (
                <span
                  aria-hidden="true"
                  data-testid="pulse-ring"
                  className="absolute inset-0 rounded-full animate-ping opacity-50 bg-current"
                />
              )}
              {/* Checkmark SVG — decorative; aria-hidden + focusable=false. */}
              {isCompleted && (
                <svg
                  className="w-4 h-4 text-black"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>

            {/* Visual label block (Badge + date text).
                The button above already carries the full accessible name, so
                this block is aria-hidden to avoid redundant announcements. */}
            <div
              aria-hidden="true"
              className="flex flex-col gap-0.5 sm:items-center sm:text-center mt-0.5 sm:mt-2"
            >
              <Badge
                variant={BADGE_VARIANT[level]}
                label={PROGRESS_LABELS[level]}
                size="sm"
              />
              {isCompleted && milestone && (
                <time
                  dateTime={new Date(milestone.timestamp * 1000).toISOString()}
                  className="text-xs text-gray-500"
                >
                  {formatDate(milestone.timestamp)}
                </time>
              )}
              {isFuture && (
                <span className="text-xs text-gray-600">Not yet reached</span>
              )}
            </div>

            {/* Expanded detail panel.
                role="region" + aria-label makes it a named landmark.
                Linked to the toggle button via aria-controls/id. */}
            {isExpanded && (
              <div
                id={`timeline-detail-${level}`}
                role="region"
                aria-label={`Details for ${PROGRESS_LABELS[level]}`}
                className="sm:absolute sm:top-full sm:mt-2 sm:left-1/2 sm:-translate-x-1/2 sm:w-56 z-20 rounded-xl border border-gray-700 bg-brand-card p-3 text-xs text-gray-300 flex flex-col gap-1 shadow-2xl"
              >
                {level === 0 && (
                  <p>Profile created on-chain. No validator required.</p>
                )}
                {level > 0 && milestone ? (
                  <>
                    <p className="font-medium text-white">
                      {milestone.description}
                    </p>
                    {/* aria-label="Approved by [address]" gives screen readers
                        the full validator context without relying on visual
                        layout clues. */}
                    <p
                      className="flex flex-col gap-1"
                      aria-label={`Approved by ${milestone.validator}`}
                    >
                      {/* "Verified by" label is decorative in context of the
                          aria-label above — hide to avoid double-reading. */}
                      <span aria-hidden="true" className="text-gray-500">
                        Verified by
                      </span>
                      <ValidatorChip address={milestone.validator} />
                    </p>
                    <p>
                      <span className="text-gray-500">Date: </span>
                      <time
                        dateTime={new Date(
                          milestone.timestamp * 1000,
                        ).toISOString()}
                      >
                        {formatDate(milestone.timestamp)}
                      </time>
                    </p>
                  </>
                ) : level > 0 ? (
                  <p className="text-gray-500">No milestone data yet.</p>
                ) : null}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
