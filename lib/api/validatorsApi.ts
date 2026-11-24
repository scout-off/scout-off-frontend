/**
 * Validator-domain API helpers (issue #1516).
 */
import { backendClient as api } from './playersApi';
import { fetchValidatorEvents, type IndexedEvent } from '../indexerClient';

/**
 * Fetches the number of milestones approved by a specific validator from the
 * indexer. Returns `null` when the indexer is unavailable or returns an
 * unexpected response so callers can fall back gracefully.
 */
export const fetchValidatorMilestoneCount = async (
  validatorAddress: string,
  // Time bounds from getValidatorLeaderboardRange (ms since epoch); omit
  // for all-time stats.
  range?: { start: number; end: number },
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
      // Indexer timestamps are Unix seconds; the range bounds are ms.
      return events.filter((event) => {
        const ms = event.timestamp * 1000;
        return ms >= range.start && ms <= range.end;
      }).length;
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
