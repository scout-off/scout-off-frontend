import { memo } from 'react';
import Link from 'next/link';
import type { Player } from '@/types';
import { PROGRESS_LABELS } from '@/types';
import ProgressBar from './ProgressBar';

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
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigate();
      }
    },
    [navigate]
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
      <div className="w-16 h-16 rounded-full bg-gray-700 overflow-hidden" aria-hidden="true">
        {ipfsHash && (
          <Image
            src={`${process.env.NEXT_PUBLIC_IPFS_GATEWAY}/${ipfsHash}`}
            alt=""
            className="w-full h-full object-cover"
          />
        )}
      </div>

      <div>
        <h3 className="font-semibold text-white">{vitals.name}</h3>
        <p className="text-sm text-gray-400">
          {vitals.position} · {vitals.region}
        </p>

        <Badge
          variant={LEVEL_VARIANT[progressLevel]}
          label={levelLabel}
          aria-label={`Level ${progressLevel}: ${levelLabel}`}
          size="sm"
          className="mt-1"
        />
      </div>

      <ProgressBar level={progressLevel} />

      {/* Decorative link — navigation is handled by the card wrapper */}
      <a
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="text-center text-sm text-brand-green border border-brand-green rounded-lg py-1.5 hover:bg-brand-green hover:text-black transition"
        onClick={(e) => e.preventDefault()}
      >
        View Profile
      </a>
    </div>
  );
}

export default memo(
  PlayerCard,
  (prev, next) =>
    prev.player.id === next.player.id &&
    prev.player.progressLevel === next.player.progressLevel,
);
