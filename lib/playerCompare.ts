import type { Player } from '@/types';
import { escapeCsvValue } from '@/lib/csvSafe';

export type CompareDirection = 'higher' | 'lower';

export type CompareMetricKey =
  | 'goals'
  | 'assists'
  | 'appearances'
  | 'clean_sheets'
  | 'progressLevel';

export interface CompareMetric {
  key: CompareMetricKey;
  /** Whether a higher or lower value wins the row. */
  direction: CompareDirection;
  get: (player: Player) => number | undefined | null;
}

/** Single source of truth for which rows are comparable and in which direction. */
export const COMPARE_METRICS: readonly CompareMetric[] = [
  { key: 'goals', direction: 'higher', get: (p) => p.stats?.goals },
  { key: 'assists', direction: 'higher', get: (p) => p.stats?.assists },
  { key: 'appearances', direction: 'higher', get: (p) => p.stats?.appearances },
  {
    key: 'clean_sheets',
    direction: 'higher',
    get: (p) => p.stats?.clean_sheets,
  },
  { key: 'progressLevel', direction: 'higher', get: (p) => p.progressLevel },
];

/**
 * Returns the indices of the leading values. Missing / non-finite values are
 * never best; ties return every tied index. Fewer than two present values
 * means there is nothing to compare, so no leader is returned.
 */
export function findLeaders(
  values: ReadonlyArray<number | undefined | null>,
  direction: CompareDirection,
): number[] {
  const present = values
    .map((value, index) => ({ value, index }))
    .filter(
      (entry): entry is { value: number; index: number } =>
        typeof entry.value === 'number' && Number.isFinite(entry.value),
    );
  if (present.length < 2) return [];
  const best =
    direction === 'higher'
      ? Math.max(...present.map((e) => e.value))
      : Math.min(...present.map((e) => e.value));
  return present.filter((e) => e.value === best).map((e) => e.index);
}

/** Maps each metric key to the set of player ids leading that row. */
export function getLeadersByMetric(
  players: readonly Player[],
): Record<CompareMetricKey, Set<string>> {
  const result = {} as Record<CompareMetricKey, Set<string>>;
  for (const metric of COMPARE_METRICS) {
    const leaders = findLeaders(players.map(metric.get), metric.direction);
    result[metric.key] = new Set(leaders.map((i) => players[i].id));
  }
  return result;
}

/**
 * Builds a formula-safe CSV of the comparison (one row per attribute, one
 * column per player). Contact details are never included.
 */
export function buildCompareCsv(
  players: readonly Player[],
  labels: Record<
    | 'attribute'
    | 'age'
    | 'position'
    | 'region'
    | 'nationality'
    | 'milestones'
    | CompareMetricKey,
    string
  >,
): string {
  const rows: Array<[string, Array<string | number | undefined | null>]> = [
    [labels.age, players.map((p) => p.vitals.age)],
    [labels.position, players.map((p) => p.vitals.position)],
    [labels.region, players.map((p) => p.vitals.region)],
    [labels.nationality, players.map((p) => p.vitals.nationality)],
    ...COMPARE_METRICS.map(
      (m) =>
        [labels[m.key], players.map(m.get)] as [
          string,
          Array<number | undefined | null>,
        ],
    ),
    [labels.milestones, players.map((p) => p.milestones.length)],
  ];
  const lines = [
    [labels.attribute, ...players.map((p) => p.vitals.name)],
    ...rows.map(([label, values]) => [
      label,
      ...values.map((v) => (v === undefined || v === null ? '' : String(v))),
    ]),
  ];
  return lines.map((line) => line.map(escapeCsvValue).join(',')).join('\n');
}
