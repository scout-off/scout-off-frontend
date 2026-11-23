'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { fetchEvents, type IndexedEvent } from '@/lib/indexerClient';

const MAX_PAGES = 10; // caps at 10 * 200 = 2000 events per type, matching useApprovedPlayers/useSpendingSummary

async function fetchAllEventsOfType(
  type: IndexedEvent['type'],
): Promise<IndexedEvent[]> {
  const all: IndexedEvent[] = [];
  let cursor: number | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { events, nextCursor } = await fetchEvents({
      type,
      limit: 200,
      before: cursor,
    });
    all.push(...events);
    if (nextCursor === null || events.length === 0) break;
    cursor = nextCursor;
  }

  return all;
}

export interface DailyPoint {
  /** 'YYYY-MM-DD', local to UTC day boundaries. */
  date: string;
  count: number;
}

export interface WeeklyPoint {
  /** 'YYYY-MM-DD' of the Monday starting that week (UTC). */
  weekStart: string;
  count: number;
}

export interface PlatformAnalyticsData {
  /** Cumulative distinct players registered, one point per day with activity. */
  playersCumulative: DailyPoint[];
  /**
   * Cumulative distinct scout wallets seen, one point per day with activity.
   * There is no dedicated scout-registration event in the indexer's schema
   * (see packages/indexer's EVENT_TYPES), so a scout's first `scout_subscribed`
   * or `player_contacted` event is used as a proxy for "registered".
   */
  scoutsCumulative: DailyPoint[];
  /** Milestones approved, bucketed per ISO week. */
  milestonesPerWeek: WeeklyPoint[];
}

function dayKey(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10);
}

function weekStartKey(timestampSeconds: number): string {
  const d = new Date(timestampSeconds * 1000);
  const day = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() - diffToMonday,
    ),
  );
  return monday.toISOString().slice(0, 10);
}

function toCumulativeSeries(days: Map<string, number>): DailyPoint[] {
  const sortedKeys = [...days.keys()].sort();
  let running = 0;
  return sortedKeys.map((date) => {
    running += days.get(date)!;
    return { date, count: running };
  });
}

function buildCumulativeByFirstSeen(
  events: IndexedEvent[],
  identityOf: (e: IndexedEvent) => string | null,
): DailyPoint[] {
  const firstSeenDayByIdentity = new Map<string, string>();

  for (const event of events) {
    const identity = identityOf(event);
    if (!identity) continue;
    const day = dayKey(event.timestamp);
    const existing = firstSeenDayByIdentity.get(identity);
    if (!existing || day < existing) {
      firstSeenDayByIdentity.set(identity, day);
    }
  }

  const newPerDay = new Map<string, number>();
  for (const day of firstSeenDayByIdentity.values()) {
    newPerDay.set(day, (newPerDay.get(day) ?? 0) + 1);
  }

  return toCumulativeSeries(newPerDay);
}

async function fetchPlatformAnalytics(): Promise<PlatformAnalyticsData> {
  const [
    playerRegistered,
    scoutSubscribed,
    playerContacted,
    milestoneApproved,
  ] = await Promise.all([
    fetchAllEventsOfType('player_registered'),
    fetchAllEventsOfType('scout_subscribed'),
    fetchAllEventsOfType('player_contacted'),
    fetchAllEventsOfType('milestone_approved'),
  ]);

  const playersCumulative = buildCumulativeByFirstSeen(
    playerRegistered,
    (e) => e.playerId,
  );

  const scoutsCumulative = buildCumulativeByFirstSeen(
    [...scoutSubscribed, ...playerContacted],
    (e) => e.scout,
  );

  const milestonesPerWeekMap = new Map<string, number>();
  for (const event of milestoneApproved) {
    const week = weekStartKey(event.timestamp);
    milestonesPerWeekMap.set(week, (milestonesPerWeekMap.get(week) ?? 0) + 1);
  }
  const milestonesPerWeek: WeeklyPoint[] = [...milestonesPerWeekMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStart, count]) => ({ weekStart, count }));

  return { playersCumulative, scoutsCumulative, milestonesPerWeek };
}

const PLATFORM_ANALYTICS_KEY = 'platform-analytics';

/**
 * Fetches the full history of registration/milestone events from the indexer
 * and aggregates them into the three admin-panel analytics series. Date-range
 * "zooming" is applied by the consuming component over this full series
 * rather than re-fetched per range, so cumulative counts stay correct even
 * when the visible window starts mid-history.
 */
export function usePlatformAnalytics() {
  const { data, error, isValidating, mutate } = useSWR<PlatformAnalyticsData>(
    PLATFORM_ANALYTICS_KEY,
    fetchPlatformAnalytics,
    {
      dedupingInterval: 30_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const refetch = useCallback(() => {
    mutate(undefined, { revalidate: true });
  }, [mutate]);

  return {
    data: data ?? null,
    loading: isValidating && !data,
    error: error?.message ?? null,
    refetch,
  };
}
