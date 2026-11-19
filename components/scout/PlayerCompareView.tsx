'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { Player } from '@/types';
import { getProgressLabel } from '@/lib/progress';
import { getMediaProxyUrl } from '@/lib/mediaUrl';
import { FOOTBALL_POSITIONS } from '@/lib/positions';
import ProgressBar from '@/components/ProgressBar';
import MilestoneTimeline from '@/components/player/MilestoneTimeline';
import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';
import { Trophy } from 'lucide-react';
import { getLeadersByMetric, type CompareMetricKey } from '@/lib/playerCompare';

type Leaders = Record<CompareMetricKey, Set<string>>;

/** Icon + visually hidden text so the leader cue never relies on colour alone. */
function BestMarker({ label }: { label: string }) {
  return (
    <>
      <Trophy
        size={14}
        aria-hidden="true"
        className="inline-block mr-1 text-yellow-400 align-[-2px]"
        data-testid="compare-best"
      />
      <span className="sr-only">{label}: </span>
    </>
  );
}

const LEVEL_VARIANT: Record<number, 'level0' | 'level1' | 'level2' | 'level3'> =
  {
    0: 'level0',
    1: 'level1',
    2: 'level2',
    3: 'level3',
  };

const POSITION_LABEL: Record<string, string> = Object.fromEntries(
  FOOTBALL_POSITIONS.map(({ value, label }) => [value, label]),
);

function CompareColumn({
  player,
  leaders,
}: {
  player: Player;
  leaders?: Leaders;
}) {
  const levelLabel = getProgressLabel(player.progressLevel);
  const nameId = `compare-col-name-${player.id}`;
  const t = useTranslations('scout.compare');
  // Stat labels are shared with PlayerStatsCard.
  const ts = useTranslations('stats');
  const name = player.vitals.name;
  const isBest = (key: CompareMetricKey) =>
    leaders?.[key]?.has(player.id) ?? false;
  const statCell = (key: CompareMetricKey, value: number) => (
    <dd
      className={`text-right ${isBest(key) ? 'text-yellow-300 font-semibold' : 'text-white'}`}
    >
      {isBest(key) && <BestMarker label={t('best')} />}
      {value}
    </dd>
  );

  return (
    // Each column is a labelled group (not a landmark) so screen-reader users
    // can navigate between players without every column's inner headings
    // colliding as duplicate "Vitals"/"Stats" landmarks.
    <div
      role="group"
      aria-labelledby={nameId}
      className="flex flex-col gap-5 bg-brand-card border border-gray-800 rounded-xl p-5"
    >
      {/* Avatar + Name */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="w-20 h-20 rounded-full bg-gray-700 overflow-hidden"
          aria-hidden="true"
        >
          {player.ipfsHash && (
            <Image
              src={getMediaProxyUrl(player.ipfsHash)}
              alt={player.vitals.name}
              width={80}
              height={80}
              className="w-full h-full object-cover"
            />
          )}
        </div>
        <div>
          <h3 id={nameId} className="font-semibold text-white text-lg">
            {player.vitals.name}
          </h3>
          <Badge
            variant={LEVEL_VARIANT[player.progressLevel]}
            label={levelLabel}
            size="sm"
          />
        </div>
      </div>

      {/* Vitals */}
      <section aria-label={t('vitals_label', { name })}>
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          {t('vitals')}
        </h4>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-gray-400">{t('age')}</dt>
          <dd className="text-white text-right">{player.vitals.age}</dd>

          <dt className="text-gray-400">{t('position')}</dt>
          <dd className="text-white text-right">
            <Tooltip
              content={
                POSITION_LABEL[player.vitals.position] ?? player.vitals.position
              }
            >
              <span>{player.vitals.position}</span>
            </Tooltip>
          </dd>

          <dt className="text-gray-400">{t('region')}</dt>
          <dd className="text-white text-right">{player.vitals.region}</dd>

          <dt className="text-gray-400">{t('nationality')}</dt>
          <dd className="text-white text-right">{player.vitals.nationality}</dd>
        </dl>
      </section>

      {/* Stats */}
      {player.stats && (
        <section aria-label={t('stats_label', { name })}>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            {t('stats')}
          </h4>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            {player.stats.goals !== undefined && (
              <>
                <dt className="text-gray-400">{ts('goals')}</dt>
                {statCell('goals', player.stats.goals)}
              </>
            )}
            {player.stats.assists !== undefined && (
              <>
                <dt className="text-gray-400">{ts('assists')}</dt>
                {statCell('assists', player.stats.assists)}
              </>
            )}
            {player.stats.appearances !== undefined && (
              <>
                <dt className="text-gray-400">{ts('appearances')}</dt>
                {statCell('appearances', player.stats.appearances)}
              </>
            )}
            {player.stats.clean_sheets !== undefined && (
              <>
                <dt className="text-gray-400">{ts('clean_sheets')}</dt>
                {statCell('clean_sheets', player.stats.clean_sheets)}
              </>
            )}
          </dl>
        </section>
      )}

      {/* Progress */}
      <section aria-label={t('progress_label', { name })}>
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          {t('progress')}
        </h4>
        {isBest('progressLevel') && (
          <p className="text-xs text-yellow-300 font-semibold mb-1">
            <BestMarker label={t('best')} />
            {t('best_progress')}
          </p>
        )}
        <ProgressBar level={player.progressLevel} />
      </section>

      {/* Milestones */}
      <section aria-label={t('milestones_label', { name })}>
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          {t('milestones')}
        </h4>
        <p className="text-sm text-gray-300 mb-3">
          {t('milestone_count', { count: player.milestones.length })}
        </p>
        <MilestoneTimeline
          milestones={player.milestones}
          currentLevel={player.progressLevel}
          playerId={player.id}
        />
      </section>
    </div>
  );
}

interface PlayerCompareViewProps {
  players: Player[];
}

export default function PlayerCompareView({ players }: PlayerCompareViewProps) {
  const leaders = getLeadersByMetric(players);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {players.map((player) => (
        <CompareColumn key={player.id} player={player} leaders={leaders} />
      ))}
    </div>
  );
}
