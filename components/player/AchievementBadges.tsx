import { useTranslations } from 'next-intl';
import {
  getEarnedBadges,
  MILESTONE_COLLECTOR_THRESHOLD,
  MILESTONE_MASTER_THRESHOLD,
  type BadgeId,
} from '@/lib/badges';
import type { Player } from '@/types';
import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';

const BADGE_COUNTS: Partial<Record<BadgeId, number>> = {
  milestone_collector: MILESTONE_COLLECTOR_THRESHOLD,
  milestone_master: MILESTONE_MASTER_THRESHOLD,
};

export default function AchievementBadges({ player }: { player: Player }) {
  const t = useTranslations('player_profile.achievement_badges');
  const badges = getEarnedBadges(player);

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t('label')}>
      {badges.map((badge) => (
        <Tooltip
          key={badge.id}
          content={t(`badges.${badge.id}.description`, {
            count: BADGE_COUNTS[badge.id] ?? 0,
          })}
        >
          <Badge variant="achievement" label={t(`badges.${badge.id}.label`)} />
        </Tooltip>
      ))}
    </div>
  );
}
