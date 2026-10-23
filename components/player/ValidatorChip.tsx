'use client';

/**
 * ValidatorChip
 *
 * Displays a reputation indicator for a milestone validator.
 *
 * – Calls `checkIsValidator` to determine active/former status.
 * – Fetches the validator's approved milestone count from the indexer.
 * – Looks up the academy (if any) this wallet is a registered signer for
 *   (issue #663) and shows its name instead of a bare address when found —
 *   see docs/academy-validator-model.md.
 * – Shows a tooltip with the count when available.
 * – Falls back gracefully to address-only display when the indexer is down or
 *   the contract call fails.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Tooltip from '@/components/ui/Tooltip';
import Badge from '@/components/ui/Badge';
import { checkIsValidator } from '@/lib/contract';
import { fetchValidatorMilestoneCount, fetchAcademyForWallet } from '@/lib/api';

/** Small institution glyph for the academy-affiliation marker — decorative,
 * the accessible name comes from the enclosing Badge's aria-label. */
function AcademyIcon() {
  return (
    <svg
      className="w-3 h-3"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10 2L1 7l9 5 7-3.89V15h2V7L10 2zM5 10.09V14c0 .35 3 3 5 3s5-2.65 5-3v-3.91l-5 2.78-5-2.78z" />
    </svg>
  );
}

export interface ValidatorChipProps {
  /** Full Stellar public key of the validator. */
  address: string;
  /** Optional display name shown on hover if validator is known. */
  label?: string;
  /** Additional Tailwind classes for custom sizing or colour. */
  className?: string;
}

type Status = 'loading' | 'active' | 'former' | 'unknown';

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

export default function ValidatorChip({
  address,
  label,
  className,
}: ValidatorChipProps) {
  const t = useTranslations('validator.chip');
  const [status, setStatus] = useState<Status>('loading');
  const [milestoneCount, setMilestoneCount] = useState<number | null>(null);
  const [academyName, setAcademyName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Fire all requests concurrently; each can fail independently.
      const [isActive, count, academy] = await Promise.all([
        checkIsValidator(address).catch(() => null),
        fetchValidatorMilestoneCount(address),
        fetchAcademyForWallet(address),
      ]);

      if (cancelled) return;

      if (isActive === null) {
        setStatus('unknown');
      } else {
        setStatus(isActive ? 'active' : 'former');
      }
      setMilestoneCount(count);
      setAcademyName(academy?.name ?? null);
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

  const statusLabelKey: Record<Status, string> = {
    loading: 'loading',
    active: 'active',
    former: 'former',
    unknown: 'unknown',
  };
  const statusLabel = t(statusLabelKey[status]);

  const dotClasses: Record<Status, string> = {
    loading: 'bg-gray-500 animate-pulse',
    active: 'bg-emerald-400',
    former: 'bg-amber-400',
    unknown: 'bg-gray-500',
  };

  // Build tooltip text only when data is ready. The academy name (if any)
  // is prepended so a milestone approved by a registered academy signer
  // reads as "Academy X · Active validator · N milestones approved" rather
  // than surfacing only the individual wallet.
  const statusAndCount =
    status === 'loading'
      ? t('fetching')
      : milestoneCount !== null
        ? t('milestones_approved', {
            status: statusLabel,
            count: milestoneCount,
          })
        : `${statusLabel} · ${truncateAddress(address)}`;
  const tooltipContent = academyName
    ? `${academyName} · ${statusAndCount}`
    : statusAndCount;
  const displayLabel = label ?? academyName ?? truncateAddress(address);
  const displayKind = label ? undefined : academyName ? 'academy' : 'address';

  const chip = (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium leading-none select-none',
        chipClasses[status],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={tooltipContent}
    >
      {/* Status dot */}
      <span
        aria-hidden="true"
        className={[
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          dotClasses[status],
        ].join(' ')}
      />

      {/* Label: academy name when this wallet is a registered signer for
          one, otherwise the raw address — always visible; status text only
          shown once resolved. The optional label prop lets callers override
          the display name entirely. */}
      {displayLabel ? (
        <span
          className={displayKind === 'address' ? 'font-mono' : 'font-medium'}
        >
          {displayLabel}
        </span>
      ) : (
        <span className="font-mono">{truncateAddress(address)}</span>
      )}

      {/* Academy-affiliation marker: on top of the name substitution above,
          gives a scannable "institution vs. independent" signal that doesn't
          require reading the full label. Reuses the shared Badge component
          rather than a bespoke visual for this one spot (issue #1169). */}
      {displayKind === 'academy' && (
        <Badge
          variant="academy"
          label={t('academy_affiliated')}
          size="sm"
          icon={<AcademyIcon />}
          className="!px-1.5 !py-0"
        />
      )}

      {status !== 'loading' && status !== 'unknown' && (
        <>
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <span>{statusLabel}</span>
        </>
      )}
    </span>
  );

  return <Tooltip content={tooltipContent}>{chip}</Tooltip>;
}
