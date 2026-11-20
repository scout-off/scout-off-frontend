import { escapeCsvValue } from '@/lib/csvSafe';
import type { Player } from '@/types';

/**
 * Comparable rows in the player compare view (issue #1721). `direction`
 * says which end of the scale is best; add `'lower'` metrics here (e.g. goals
 * conceded) and the leader highlight follows automatically.
 */
export type CompareMetricKey =
  | 'progressLevel'
  | 'goals'
  | 'assists'
  | 'appearances'
  | 'clean_sheets';

export interface CompareMetric {
  key: CompareMetricKey;
  direction: 'higher' | 'lower';
  value: (player: Player) => number | undefined;
}

export const COMPARE_METRICS: CompareMetric[] = [
  {
    key: 'progressLevel',
    direction: 'higher',
    value: (p) => p.progressLevel,
  },
  { key: 'goals', direction: 'higher', value: (p) => p.stats?.goals },
  { key: 'assists', direction: 'higher', value: (p) => p.stats?.assists },
  {
    key: 'appearances',
    direction: 'higher',
    value: (p) => p.stats?.appearances,
  },
  {
    key: 'clean_sheets',
    direction: 'higher',
    value: (p) => p.stats?.clean_sheets,
  },
];

/**
 * Ids of the players holding the best value for `metric`. Ties return every
 * tied player; missing or non-finite values are never best. Returns an empty
 * set when fewer than two players have a value, since a lone value isn't a
 * "lead" over anyone.
 */
export function findLeaders(
  players: Player[],
  metric: CompareMetric,
): Set<string> {
  const valued = players
    .map((player) => ({ id: player.id, value: metric.value(player) }))
    .filter(
      (entry): entry is { id: string; value: number } =>
        typeof entry.value === 'number' && Number.isFinite(entry.value),
    );
  if (valued.length < 2) return new Set();

  const values = valued.map((entry) => entry.value);
  const best =
    metric.direction === 'higher' ? Math.max(...values) : Math.min(...values);
  return new Set(
    valued.filter((entry) => entry.value === best).map((entry) => entry.id),
  );
}

/** Leader ids for every metric, keyed by metric key. */
export function findAllLeaders(
  players: Player[],
): Record<CompareMetricKey, Set<string>> {
  return Object.fromEntries(
    COMPARE_METRICS.map((metric) => [metric.key, findLeaders(players, metric)]),
  ) as Record<CompareMetricKey, Set<string>>;
}

/**
 * Formula-safe CSV of the comparison: one row per field, one column per
 * player. Only public profile fields are included — never contact details.
 */
export function buildCompareCsv(
  players: Player[],
  labels: Record<string, string>,
): string {
  const rows: Array<[string, Array<string | number | undefined>]> = [
    [labels.name, players.map((p) => p.vitals.name)],
    [labels.age, players.map((p) => p.vitals.age)],
    [labels.position, players.map((p) => p.vitals.position)],
    [labels.region, players.map((p) => p.vitals.region)],
    [labels.nationality, players.map((p) => p.vitals.nationality)],
    ...COMPARE_METRICS.map(
      (metric) =>
        [labels[metric.key], players.map(metric.value)] as [
          string,
          Array<number | undefined>,
        ],
    ),
    [labels.milestones, players.map((p) => p.milestones.length)],
  ];
  return rows
    .map(([label, values]) =>
      [label, ...values]
        .map((value) =>
          escapeCsvValue(value === undefined ? '' : String(value)),
        )
        .join(','),
    )
    .join('\n');
}
