'use client';

import type { Milestone, ProgressLevel } from '@/types';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import { useToast } from '@/components/ui/Toast';

// Maps a milestone's position in verified-history to the level badge variant.
// Milestones approved by validators are at least level 2.
const LEVEL_VARIANT = ['level0', 'level1', 'level2', 'level3'] as const;
const LEVEL_LABELS = [
  'Unverified',
  'Verified',
  'Performance',
  'Elite',
] as const;

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

function formatFull(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatRelative(ts: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - ts;
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo} month${diffMo !== 1 ? 's' : ''} ago`;
  const diffYr = Math.floor(diffMo / 12);
  return `${diffYr} year${diffYr !== 1 ? 's' : ''} ago`;
}

interface MilestoneListProps {
  milestones: Milestone[];
  /** Override the level badge based on milestone index (defaults to level2). */
  level?: ProgressLevel;
}

export default function MilestoneList({
  milestones,
  level = 2,
}: MilestoneListProps) {
  const { show } = useToast();

  if (milestones.length === 0) {
    return (
      <EmptyState
        title="No milestones yet"
        description="Verified milestones from approved validators will appear here."
      />
    );
  }

  const sorted = [...milestones].sort((a, b) => b.timestamp - a.timestamp);

  async function copyAddress(addr: string) {
    try {
      await navigator.clipboard.writeText(addr);
      show({ message: 'Copied', variant: 'success' });
    } catch {
      show({ message: 'Copy failed', variant: 'error' });
    }
  }

  const badgeVariant = LEVEL_VARIANT[level];
  const badgeLabel = LEVEL_LABELS[level];

  return (
    <ul className="flex flex-col gap-3" aria-label="Milestone history">
      {sorted.map((m) => (
        <li
          key={m.id}
          className="text-sm text-gray-300 border-l-2 border-brand-green pl-3 flex flex-col gap-1"
        >
          <span>{m.description}</span>

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <Badge variant={badgeVariant} label={badgeLabel} size="sm" />

            <Tooltip content={`Full address: ${m.validator}`}>
              <button
                type="button"
                onClick={() => copyAddress(m.validator)}
                className="font-mono hover:text-brand-green focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-green rounded transition"
                aria-label={`Copy validator address ${m.validator}`}
              >
                {truncateAddress(m.validator)}
              </button>
            </Tooltip>

            <Tooltip content={formatFull(m.timestamp)}>
              <time
                dateTime={new Date(m.timestamp * 1000).toISOString()}
                className="cursor-default"
              >
                {formatRelative(m.timestamp)}
              </time>
            </Tooltip>
          </div>
        </li>
      ))}
    </ul>
  );
}
