'use client';

import { useTranslations } from 'next-intl';
import type { Milestone, ProgressLevel } from '@/types';
import MilestoneList from '@/components/player/MilestoneList';

interface MilestoneSectionProps {
  milestones: Milestone[];
  /**
   * Level badge variant applied to every milestone row. Defaults to 2
   * ("Performance") which matches the typical case of a player who has
   * at least one verified milestone. Pass `player.progressLevel` so the
   * badge reflects the player's actual tier.
   */
  level?: ProgressLevel;
}

/**
 * Dashboard section chrome that delegates inner rendering to the rich
 * `MilestoneList` (badges, copyable validator address, relative timestamps
 * via Tooltip). Extracted so this section can be reused in scout views or
 * other player-related pages and tested without PlayerProfileForm mount.
 *
 * The empty case is delegated too — `MilestoneList` renders the
 * `EmptyState` itself when `milestones.length === 0`. This component
 * only renders the section card + translated heading.
 */
export default function MilestoneSection({
  milestones,
  level = 2,
}: MilestoneSectionProps) {
  const t = useTranslations('player_dashboard');

  return (
    // ARIA landmark: the outer <section> with aria-labelledby pointing at
    // the heading id exposes the milestones area as a navigable region in
    // screen-readers, alongside the implicit heading landmark.
    <section aria-labelledby="milestones-heading">
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <h3
          id="milestones-heading"
          className="font-semibold text-white mb-4"
        >
          {t('milestones')}
        </h3>
        <MilestoneList milestones={milestones} level={level} />
      </div>
    </section>
  );
}
