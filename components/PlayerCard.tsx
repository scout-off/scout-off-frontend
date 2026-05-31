import { memo } from 'react';
import Link from 'next/link';
import type { Player } from '@/types';
import { PROGRESS_LABELS } from '@/types';
import ProgressBar from './ProgressBar';

function PlayerCard({ player }: { player: Player }) {
  const { id, vitals, progressLevel, ipfsHash } = player;
  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-col gap-4 hover:border-brand-green transition">
      {/* Avatar placeholder */}
      <div className="w-16 h-16 rounded-full bg-gray-700 overflow-hidden">
        {ipfsHash && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${process.env.NEXT_PUBLIC_IPFS_GATEWAY}/${ipfsHash}`}
            alt={vitals.name}
            className="w-full h-full object-cover"
          />
        )}
      </div>

      <div>
        <h3 className="font-semibold text-white">{vitals.name}</h3>
        <p className="text-sm text-gray-400">
          {vitals.position} · {vitals.region}
        </p>
        <span className="inline-block mt-1 text-xs text-brand-green font-medium">
          {PROGRESS_LABELS[progressLevel]}
        </span>
      </div>

      <ProgressBar level={progressLevel} />

      <Link
        href={`/player/${id}`}
        className="text-center text-sm text-brand-green border border-brand-green rounded-lg py-1.5 hover:bg-brand-green hover:text-black transition"
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
