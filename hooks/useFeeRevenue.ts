'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { fetchEvents, type IndexedEvent } from '@/lib/indexerClient';

const MAX_PAGES = 10; // caps at 10 * 200 = 2000 events per type, matching useSpendingSummary/useApprovedPlayers

/**
 * Approximate XLM fees by subscription tier — indexed events record the tier,
 * not the amount paid, since the contract enforces amounts at submit time.
 * Mirrors hooks/useSpendingSummary.ts's TIER_FEES_XLM.
 */
const TIER_FEES_XLM: Record<string, number> = {
  basic: 5,
  pro: 12,
  elite: 20,
};

/** Fixed pay-to-contact fee, per hooks/useSpendingSummary.ts. */
const CONTACT_FEE_XLM = 1;

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

export interface DailyRevenuePoint {
  /** 'YYYY-MM-DD', UTC day boundaries. */
  date: string;
  contactFeeXlm: number;
  subscriptionXlm: number;
  totalXlm: number;
}

export interface FeeRevenueData {
  /** Newest-day-last, so it renders left-to-right chronologically. */
  daily: DailyRevenuePoint[];
}

function dayKey(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10);
}

async function fetchFeeRevenue(): Promise<FeeRevenueData> {
  const [playerContacted, scoutSubscribed] = await Promise.all([
    fetchAllEventsOfType('player_contacted'),
    fetchAllEventsOfType('scout_subscribed'),
  ]);

  const byDay = new Map<
    string,
    { contactFeeXlm: number; subscriptionXlm: number }
  >();

  for (const event of playerContacted) {
    const day = dayKey(event.timestamp);
    const entry = byDay.get(day) ?? { contactFeeXlm: 0, subscriptionXlm: 0 };
    entry.contactFeeXlm += CONTACT_FEE_XLM;
    byDay.set(day, entry);
  }

  for (const event of scoutSubscribed) {
    const day = dayKey(event.timestamp);
    const tier = String(event.data?.tier ?? 'basic');
    const fee = TIER_FEES_XLM[tier] ?? 5;
    const entry = byDay.get(day) ?? { contactFeeXlm: 0, subscriptionXlm: 0 };
    entry.subscriptionXlm += fee;
    byDay.set(day, entry);
  }

  const daily: DailyRevenuePoint[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, { contactFeeXlm, subscriptionXlm }]) => ({
      date,
      contactFeeXlm,
      subscriptionXlm,
      totalXlm: contactFeeXlm + subscriptionXlm,
    }));

  return { daily };
}

const FEE_REVENUE_KEY = 'fee-revenue';

/**
 * Fetches all pay-to-contact and subscription fee-payment events from the
 * indexer and aggregates them into a daily revenue series, split by fee
 * type. Period filtering (7/30/90/all-time) is applied by the consuming
 * component over this full series.
 */
export function useFeeRevenue() {
  const { data, error, isValidating, mutate } = useSWR<FeeRevenueData>(
    FEE_REVENUE_KEY,
    fetchFeeRevenue,
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
