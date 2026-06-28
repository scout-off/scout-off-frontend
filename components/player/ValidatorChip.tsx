'use client';

/**
 * ValidatorChip
 *
 * Displays a reputation indicator for a milestone validator.
 *
 * – Calls `checkIsValidator` to determine active/former status.
 * – Fetches the validator's approved milestone count from the indexer.
 * – Shows a tooltip with the count when available.
 * – Falls back gracefully to address-only display when the indexer is down or
 *   the contract call fails.
 */

import { useEffect, useState } from 'react';
import Tooltip from '@/components/ui/Tooltip';
import { checkIsValidator } from '@/lib/contract';
import { fetchValidatorMilestoneCount } from '@/lib/api';

interface ValidatorChipProps {
  /** Full Stellar public key of the validator. */
  address: string;
}

type Status = 'loading' | 'active' | 'former' | 'unknown';

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function ValidatorChip({ address }: ValidatorChipProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [milestoneCount, setMilestoneCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Fire both requests concurrently; each can fail independently.
      const [isActive, count] = await Promise.all([
        checkIsValidator(address).catch(() => null),
        fetchValidatorMilestoneCount(address),
      ]);

      if (cancelled) return;

      if (isActive === null) {
        setStatus('unknown');
      } else {
        setStatus(isActive ? 'active' : 'former');
      }
      setMilestoneCount(count);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [address]);

  // ── Chip appearance per status ───────────────────────────────────────────

  const chipClasses: Record<Status, string> = {
    loading: 'bg-gray-700 text-gray-400',
    active: 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/60',
    former: 'bg-amber-900/60 text-amber-300 border border-amber-700/60',
    unknown: 'bg-gray-700/60 text-gray-400 border border-gray-600/60',
  };

  const statusLabel: Record<Status, string> = {
    loading: 'Checking validator…',
    active: 'Active validator',
    former: 'Former validator',
    unknown: 'Validator status unknown',
  };

  const dotClasses: Record<Status, string> = {
    loading: 'bg-gray-500 animate-pulse',
    active: 'bg-emerald-400',
    former: 'bg-amber-400',
    unknown: 'bg-gray-500',
  };

  // Build tooltip text only when data is ready.
  const tooltipContent =
    status === 'loading'
      ? 'Fetching validator information…'
      : milestoneCount !== null
        ? `${statusLabel[status]} · ${milestoneCount} milestone${milestoneCount !== 1 ? 's' : ''} approved`
        : `${statusLabel[status]} · ${truncateAddress(address)}`;

  const chip = (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium leading-none select-none',
        chipClasses[status],
      ].join(' ')}
      aria-label={tooltipContent}
    >
      {/* Status dot */}
      <span
        aria-hidden="true"
        className={['w-1.5 h-1.5 rounded-full flex-shrink-0', dotClasses[status]].join(' ')}
      />

      {/* Label: address always visible; status text only when resolved */}
      <span className="font-mono">{truncateAddress(address)}</span>

      {status !== 'loading' && status !== 'unknown' && (
        <>
          <span aria-hidden="true" className="opacity-40">·</span>
          <span>{statusLabel[status]}</span>
        </>
      )}
    </span>
  );

  return <Tooltip content={tooltipContent}>{chip}</Tooltip>;
}
