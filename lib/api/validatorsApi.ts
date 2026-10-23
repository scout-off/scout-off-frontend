/**
 * Validator-domain API helpers (issue #1516).
 */
import { backendClient as api } from './playersApi';
import { fetchValidatorEvents, type IndexedEvent } from '../indexerClient';
import type { ValidatorLeaderboardRange } from '../validatorLeaderboard';

/**
 * Fetches the number of milestones approved by a specific validator from the
 * indexer. Returns `null` when the indexer is unavailable or returns an
 * unexpected response so callers can fall back gracefully.
 */
export const fetchValidatorMilestoneCount = async (
  validatorAddress: string,
  range?: ValidatorLeaderboardRange,
): Promise<number | null> => {
  try {
    if (range) {
      const events: IndexedEvent[] = [];
      let before: number | undefined;
      for (let page = 0; page < 10; page++) {
        const result = await fetchValidatorEvents(validatorAddress, {
          type: 'milestone_approved',
          limit: 200,
          before,
        });
        events.push(...result.events);
        if (result.nextCursor === null || result.events.length === 0) break;
        before = result.nextCursor;
      }
      return events.filter(
        (event) =>
          event.timestamp >= range.start && event.timestamp <= range.end,
      ).length;
    }

    const data = await api
      .get(`/validators/${encodeURIComponent(validatorAddress)}/stats`)
      .then((r) => r.data);
    const count = data?.milestoneCount ?? data?.milestone_count;
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
};
