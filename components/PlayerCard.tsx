'use client';
import { memo, useCallback, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { Star } from 'lucide-react';
import { getMilestoneHistory } from '@/lib/contract';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import type { Player, ProgressLevel } from '@/types';
import { getProgressLabel } from '@/lib/progress';
import { getMediaProxyUrl } from '@/lib/mediaUrl';
import ProgressBar from './ProgressBar';
import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';
import { FOOTBALL_POSITIONS } from '@/lib/positions';

/** Map position abbreviation (e.g. "ST") → full label (e.g. "Striker"). */
/** Look up the full label for a position abbreviation, e.g. 'ST' → 'Striker'. */
const POSITION_LABEL: Record<string, string> = Object.fromEntries(
  FOOTBALL_POSITIONS.map(({ value, label }) => [value, label]),
);

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

interface PlayerCardProps {
  player: Player;
  /** When provided (with onToggleWatchlist), renders a watchlist toggle star. */
  isWatched?: boolean;
  onToggleWatchlist?: () => void;
  /** When provided, renders a compare-selection checkbox at the top-left. */
  isCompareSelected?: boolean;
  onToggleCompare?: () => void;
}

function PlayerCard({
  player,
  isWatched,
  onToggleWatchlist,
  isCompareSelected,
  onToggleCompare,
}: PlayerCardProps) {
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
      className="relative bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-col gap-4 hover:border-brand-green transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-green focus:ring-offset-2 focus:ring-offset-black"
    >
      {onToggleCompare && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompare();
          }}
          aria-pressed={!!isCompareSelected}
          aria-label={
            isCompareSelected ? 'Remove from comparison' : 'Add to comparison'
          }
          className={`absolute top-3 left-3 inline-flex h-6 w-6 items-center justify-center rounded border transition focus:outline-none focus:ring-2 focus:ring-brand-green ${
            isCompareSelected
              ? 'bg-green-500 border-transparent'
              : 'border-gray-600'
          }`}
        >
          {isCompareSelected && (
            <svg
              className="w-4 h-4 text-black"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
      )}
      {onToggleWatchlist && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatchlist();
          }}
          aria-pressed={!!isWatched}
          aria-label={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
          className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:text-yellow-400 focus:outline-none focus:ring-2 focus:ring-brand-green"
        >
          <Star
            className={isWatched ? 'text-yellow-400' : ''}
            fill={isWatched ? 'currentColor' : 'none'}
            size={18}
            aria-hidden="true"
          />
        </button>
      )}
      {/* Avatar */}
      <div
        className="w-16 h-16 rounded-full bg-gray-700 overflow-hidden"
        aria-hidden="true"
      >
        {ipfsHash && (
          <Image
            src={getMediaProxyUrl(ipfsHash)}
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
          <Tooltip content={POSITION_LABEL[vitals.position] ?? vitals.position}>
            <span>{vitals.position}</span>
          </Tooltip>
          {' · '}
          {vitals.region}
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
    prev.player.progressLevel === next.player.progressLevel &&
    prev.isWatched === next.isWatched &&
    prev.onToggleWatchlist === next.onToggleWatchlist &&
    prev.isCompareSelected === next.isCompareSelected &&
    prev.onToggleCompare === next.onToggleCompare,
);
