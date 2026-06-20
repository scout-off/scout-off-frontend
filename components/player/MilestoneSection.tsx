'use client';

import { useTranslations } from 'next-intl';
import type { Milestone } from '@/types';

interface MilestoneSectionProps {
  milestones: Milestone[];
}

/**
 * Card section that renders a player's verified-milestone history, or an
 * empty-state copy when there are none.
 *
 * Extracted from app/[locale]/player/page.tsx so it can be reused in scout
 * views, other player-related pages, and tested without the full
 * PlayerProfileForm mount. The rendered DOM matches the inline JSX it
 * replaced \u2014 no behaviour change.
 *
 * Note: a richer `components/player/MilestoneList.tsx` (badges, copyable
 * validator address, relative timestamps via Tooltip) already exists in
 * the codebase. It is intentionally left decoupled from the dashboard so
 * this section's chrome stays minimal. Swap-in is a one-line change in
 * this component if richer cards are desired.
 */
export default function MilestoneSection({
  milestones,
}: MilestoneSectionProps) {
  const t = useTranslations('player_dashboard');

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
      <h3 className="font-semibold text-white mb-4">{t('milestones')}</h3>
      {milestones.length === 0 ? (
        <p className="text-gray-500 text-sm">{t('no_milestones')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {milestones.map((m) => (
            <li
              key={m.id}
              className="text-sm text-gray-300 border-l-2 border-brand-green pl-3"
            >
              {m.description}
              <span className="block text-xs text-gray-500 mt-0.5">
                {new Date(m.timestamp * 1000).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
