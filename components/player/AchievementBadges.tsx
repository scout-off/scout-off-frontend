import { getEarnedBadges } from '@/lib/badges';
import type { Player } from '@/types';
import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';

export default function AchievementBadges({ player }: { player: Player }) {
  const badges = getEarnedBadges(player);

  if (badges.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Achievement badges"
    >
      {badges.map((badge) => (
        <Tooltip key={badge.id} content={badge.description}>
          <Badge variant="achievement" label={badge.label} />
        </Tooltip>
      ))}
    </div>
  );
}
