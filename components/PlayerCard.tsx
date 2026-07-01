'use client';
import { memo, useCallback, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { getMilestoneHistory } from '@/lib/contract';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import type { Player, ProgressLevel } from '@/types';
import { getProgressLabel } from '@/lib/progress';
import ProgressBar from './ProgressBar';
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

const PREFETCH_DELAY_MS = 200;

function PlayerCard({ player }: { player: Player }) {
  const { id, vitals, progressLevel, ipfsHash } = player;
  const {
    data: milestones,
    error: milestonesError,
    isLoading: milestonesLoading,
  } = useSWR(`milestones:${id}`, () => getMilestoneHistory(id), {
    revalidateOnFocus: false,
  });
  const milestoneCount = milestones ? milestones.length : 0;
  const router = useRouter();

  const href = `/player/${id}`;
  const cacheKey = `player:${id}`;
  const levelLabel = getProgressLabel(progressLevel);
  const cardLabel = `${vitals.name}, ${vitals.position}, Level ${progressLevel} – ${levelLabel}`;

  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prefetch the route and prime the SWR cache. The updater function only
  // writes if the key has no existing entry, so fresher data is never clobbered.
  const triggerPrefetch = useCallback(() => {
    router.prefetch(href);
    mutate(
      cacheKey,
      (existing: Player | null | undefined) => existing ?? player,
      { revalidate: false },
    );
  }, [router, href, cacheKey, player]);

  // Debounced: schedule prefetch 200ms after the pointer enters. Brief or
  // accidental cursor movements cancel before the timer fires.
  const handleMouseEnter = useCallback(() => {
    if (prefetchTimerRef.current !== null) {
      clearTimeout(prefetchTimerRef.current);
    }
    prefetchTimerRef.current = setTimeout(() => {
      triggerPrefetch();
      prefetchTimerRef.current = null;
    }, PREFETCH_DELAY_MS);
  }, [triggerPrefetch]);

  const handleMouseLeave = useCallback(() => {
    if (prefetchTimerRef.current !== null) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  }, []);

  // Clear any pending timer on unmount to avoid post-unmount state updates.
  useEffect(() => {
    return () => {
      if (prefetchTimerRef.current !== null) {
        clearTimeout(prefetchTimerRef.current);
      }
    };
  }, []);

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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={triggerPrefetch}
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
        {/* Milestone count badge */}
        {milestonesLoading ? (
          <span className="inline-block h-4 w-12 bg-gray-600 rounded animate-pulse mt-1" />
        ) : (
          <Badge
            role="none"
            variant="region"
            label={`${milestoneCount} milestones`}
            size="sm"
            className="mt-1"
          />
        )}
      </div>

      <ProgressBar level={progressLevel} />

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
