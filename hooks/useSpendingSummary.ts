'use client';

import { useEffect, useState, useMemo } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { fetchEvents, type IndexedEvent } from '@/lib/indexerClient';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MonthlyBreakdown {
  /** 'YYYY-MM' formatted month key. */
  monthKey: string;
  /** Human-readable month label, e.g. "Jan 2026". */
  label: string;
  /** Total XLM spent on contact fees this month. */
  contactFeeXlm: number;
  /** Total XLM spent on subscriptions this month. */
  subscriptionXlm: number;
  /** Combined total. */
  totalXlm: number;
}

export interface SpendingSummaryData {
  /** Total XLM spent on contact fees (all time). */
  totalContactFeesXlm: number;
  /** Total XLM spent on subscriptions (all time). */
  totalSubscriptionsXlm: number;
  /** Combined total. */
  totalXlm: number;
  /** Month-by-month breakdown, newest first. */
  monthlyBreakdown: MonthlyBreakdown[];
}

import { resolveContactFee, resolveSubscriptionFee } from '@/lib/feeSchedule';

const MONTH_LABEL_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
};

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', MONTH_LABEL_FORMAT);

/** How many trailing months to include in the breakdown. */
const TRAILING_MONTHS = 12;

// ── Helpers ────────────────────────────────────────────────────────────────────

function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthLabel(date: Date): string {
  return MONTH_FORMATTER.format(date);
}

/**
 * Generates the last N month key → label pairs so months with zero spend
 * still appear in the breakdown.
 */
function trailingMonthKeys(count: number): { key: string; label: string }[] {
  const now = new Date();
  const months: { key: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: monthLabel(d) });
  }
  return months;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Fetches a scout's historical payment events from the indexer and aggregates
 * them into a spending summary (totals + monthly breakdown).
 *
 * Only `scout_subscribed` and `player_contacted` events are included as they
 * represent actual XLM outflows from the scout's wallet.
 */
export function useSpendingSummary(): {
  data: SpendingSummaryData | null;
  loading: boolean;
  error: string | null;
} {
  const { publicKey } = useWallet();
  const [events, setEvents] = useState<IndexedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Fetch scout's events from the indexer. We fetch all pages to get a
    // complete picture for the spending summary.
    async function load() {
      try {
        const allEvents: IndexedEvent[] = [];
        let cursor: number | undefined;

        // Fetch up to 10 pages (same cap as getMilestoneHistoryFromIndexer).
        for (let page = 0; page < 10; page++) {
          const params: { limit: number; before?: number } = { limit: 200 };
          if (cursor !== undefined) params.before = cursor;

          const { events: batch, nextCursor } = await fetchEvents(params);
          allEvents.push(...batch);

          if (nextCursor === null || batch.length === 0) break;
          cursor = nextCursor;
        }

        // Filter to only this scout's spending events.
        const scoutEvents = allEvents.filter(
          (e) =>
            e.scout === publicKey &&
            (e.type === 'scout_subscribed' || e.type === 'player_contacted'),
        );

        if (!cancelled) {
          setEvents(scoutEvents);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load spending data');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const data = useMemo<SpendingSummaryData | null>(() => {
    if (events.length === 0 && !loading) {
      return {
        totalContactFeesXlm: 0,
        totalSubscriptionsXlm: 0,
        totalXlm: 0,
        monthlyBreakdown: trailingMonthKeys(TRAILING_MONTHS).map((m) => ({
          monthKey: m.key,
          label: m.label,
          contactFeeXlm: 0,
          subscriptionXlm: 0,
          totalXlm: 0,
        })),
      };
    }

    if (events.length === 0) return null;

    let totalContactFees = 0;
    let totalSubscriptions = 0;

    // Aggregate by month.
    const byMonth = new Map<
      string,
      { contactFeeXlm: number; subscriptionXlm: number }
    >();

    for (const event of events) {
      const ts = event.timestamp * 1000; // Unix seconds → ms
      const date = new Date(ts);
      const key = monthKey(date);

      if (!byMonth.has(key)) {
        byMonth.set(key, { contactFeeXlm: 0, subscriptionXlm: 0 });
      }

      const entry = byMonth.get(key)!;

      if (event.type === 'player_contacted') {
        const fee = resolveContactFee(event.data);
        entry.contactFeeXlm += fee;
        totalContactFees += fee;
      } else if (event.type === 'scout_subscribed') {
        const fee = resolveSubscriptionFee(event.data);
        entry.subscriptionXlm += fee;
        totalSubscriptions += fee;
      }
    }

    // Build month breakdown — include trailing 12 months, fill zeroes for missing.
    const allMonths = trailingMonthKeys(TRAILING_MONTHS);
    const monthlyBreakdown: MonthlyBreakdown[] = [];
    for (const month of allMonths) {
      const entry = byMonth.get(month.key);
      const contactFeeXlm = entry?.contactFeeXlm ?? 0;
      const subscriptionXlm = entry?.subscriptionXlm ?? 0;
      monthlyBreakdown.push({
        monthKey: month.key,
        label: month.label,
        contactFeeXlm,
        subscriptionXlm,
        totalXlm: contactFeeXlm + subscriptionXlm,
      });
    }

    return {
      totalContactFeesXlm: totalContactFees,
      totalSubscriptionsXlm: totalSubscriptions,
      totalXlm: totalContactFees + totalSubscriptions,
      monthlyBreakdown,
    };
  }, [events, loading]);

  return { data, loading, error };
}
