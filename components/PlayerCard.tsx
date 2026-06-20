import { memo, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { Player, ProgressLevel } from '@/types';
import { PROGRESS_LABELS } from '@/types';
import PlayerVitalsCard from '@/components/player/PlayerVitalsCard';
import Badge from '@/components/ui/Badge';

const LEVEL_VARIANT: Record<
  ProgressLevel,
  'level0' | 'level1' | 'level2' | 'level3'
> = {
  0: 'level0',
  1: 'level1',
  2: 'level2',
  3: 'level3',
};

function PlayerCard({ player }: { player: Player }) {
  const { id, vitals, progressLevel, ipfsHash } = player;
  const router = useRouter();

  const href = `/player/${id}`;
  const levelLabel = PROGRESS_LABELS[progressLevel];
  const cardLabel = `${vitals.name}, ${vitals.position}, Level ${progressLevel} – ${levelLabel}`;

  const navigate = useCallback(() => {
    router.push(href);
  }, [router, href]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate();
      }
    },
    [navigate],
  );

  return (
    <div
      role="article"
      aria-label={cardLabel}
      tabIndex={0}
      onClick={navigate}
      onKeyDown={handleKeyDown}
      className="bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-col gap-4 hover:border-brand-green transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-green focus:ring-offset-2 focus:ring-offset-black"
    >
      {/* Avatar */}
      <div
        className="w-16 h-16 rounded-full bg-gray-700 overflow-hidden"
        aria-hidden="true"
      >
        {ipfsHash && (
          <Image
            src={`${process.env.NEXT_PUBLIC_IPFS_GATEWAY}/${ipfsHash}`}
            alt={vitals.name}
            width={64}
            height={64}
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Identity + progress — delegated to PlayerVitalsCard for consistency
          with the player dashboard's vitals UX. headingLevel=3 because the
          player name is a sub-heading in the (h1-titled) Scout Dashboard
          grid. landmark=false + chrome=false so a grid of tiles does not
          expose one region per card to assistive tech and so PlayerCard's
          outer rounded article remains the only card chrome applied
          (avoiding nested card visuals). */}
      <PlayerVitalsCard
        vitals={vitals}
        progressLevel={progressLevel}
        headingLevel={3}
        landmark={false}
        chrome={false}
      />

      <Badge
        variant={LEVEL_VARIANT[progressLevel]}
        label={levelLabel}
        aria-label={`Level ${progressLevel}: ${levelLabel}`}
        size="sm"
        className="self-start"
      />

      {/* Decorative link — navigation is handled by the card wrapper */}
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="text-center text-sm text-brand-green border border-brand-green rounded-lg py-1.5 hover:bg-brand-green hover:text-black transition"
        onClick={(e) => e.preventDefault()}
      >
        View Profile
      </Link>
    </div>
  );
}

export default memo(
  PlayerCard,
  (prev, next) =>
    prev.player.id === next.player.id &&
    prev.player.progressLevel === next.player.progressLevel,
);
