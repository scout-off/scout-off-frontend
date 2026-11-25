/**
 * Pure saved-search matcher (issue #1705). Same semantics as the scout
 * dashboard's discovery filter (PlayerFilterForm → useInfinitePlayers →
 * indexer GET /players): exact region, exact position, progress level at or
 * above `minLevel`, archived profiles excluded. Empty/omitted criteria match
 * everything. The dashboard applies it to each results page and the
 * saved-search alert cron uses it, so the two cannot diverge.
 */
import type { Player, PlayerFilter } from '@/types';

export type MatchablePlayer = Pick<Player, 'progressLevel' | 'archived'> & {
  vitals: Pick<Player['vitals'], 'region' | 'position'>;
};

export function matchesSavedSearch(
  player: MatchablePlayer,
  criteria: PlayerFilter,
): boolean {
  if (player.archived) return false;
  if (criteria.region && player.vitals.region !== criteria.region) return false;
  if (criteria.position && player.vitals.position !== criteria.position)
    return false;
  return player.progressLevel >= (criteria.minLevel ?? 0);
}

/** Scout dashboard URL with the saved search's filter applied (see PlayerFilterForm's URL state). */
export function savedSearchDashboardHref(criteria: PlayerFilter): string {
  const params = new URLSearchParams();
  if (criteria.region) params.set('region', criteria.region);
  if (criteria.position) params.set('position', criteria.position);
  if (criteria.minLevel) params.set('level', String(criteria.minLevel));
  const query = params.toString();
  return query ? `/scout?${query}` : '/scout';
}
