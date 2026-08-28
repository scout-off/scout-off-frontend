'use client';

import { useCallback } from 'react';
import { mutate } from 'swr';
import { useIndexerEventCache, INDEXER_CACHE_KEY } from './useIndexerEventCache';

import { resolveContactFee, resolveSubscriptionFee } from '@/lib/feeSchedule';

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

/**
 * Fetches all pay-to-contact and subscription fee-payment events from the
 * shared indexer event cache and aggregates them into a daily revenue series,
 * split by fee type. Period filtering (7/30/90/all-time) is applied by the
 * consuming component over this full series.
 *
 * Uses useIndexerEventCache internally so that concurrent consumers on the
 * same page (e.g. FeeRevenueChart + notifications panel) share a single
 * indexer fetch rather than firing independent full scans.
 */
export function useFeeRevenue() {
  const cache = useIndexerEventCache();

  const refetch = useCallback(() => {
    mutate(INDEXER_CACHE_KEY, undefined, { revalidate: true });
  }, []);

  if (cache.loading) {
    return { data: null, loading: true, error: null, refetch };
  }

  if (cache.error) {
    return { data: null, loading: false, error: cache.error, refetch };
  }

  const byDay = new Map<
    string,
    { contactFeeXlm: number; subscriptionXlm: number }
  >();

  for (const event of cache.events) {
    if (event.type === 'player_contacted') {
      const day = dayKey(event.timestamp);
      const entry = byDay.get(day) ?? { contactFeeXlm: 0, subscriptionXlm: 0 };
      entry.contactFeeXlm += resolveContactFee(event.data);
      byDay.set(day, entry);
    } else if (event.type === 'scout_subscribed') {
      const day = dayKey(event.timestamp);
      const fee = resolveSubscriptionFee(event.data);
      const entry = byDay.get(day) ?? { contactFeeXlm: 0, subscriptionXlm: 0 };
      entry.subscriptionXlm += fee;
      byDay.set(day, entry);
    }
  }

  const daily: DailyRevenuePoint[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, { contactFeeXlm, subscriptionXlm }]) => ({
      date,
      contactFeeXlm,
      subscriptionXlm,
      totalXlm: contactFeeXlm + subscriptionXlm,
    }));

  return {
    data: { daily } satisfies FeeRevenueData,
    loading: false,
    error: null,
    refetch,
  };
}
