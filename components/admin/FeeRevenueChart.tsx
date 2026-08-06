'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useFeeRevenue } from '@/hooks/useFeeRevenue';
import { formatXlm } from '@/lib/formatXlm';
import EmptyState from '@/components/ui/EmptyState';

const BRAND_GREEN = '#00C853';
const BRAND_BLUE = '#3B82F6';

const PERIODS = [
  { key: '7', label: '7d', days: 7 },
  { key: '30', label: '30d', days: 30 },
  { key: '90', label: '90d', days: 90 },
  { key: 'all', label: 'All-time', days: null },
] as const;

type PeriodKey = (typeof PERIODS)[number]['key'];

const TOOLTIP_STYLE = {
  backgroundColor: '#111827',
  border: '1px solid #374151',
  borderRadius: 8,
  fontSize: 12,
};

export default function FeeRevenueChart() {
  const { data, loading, error } = useFeeRevenue();
  const [period, setPeriod] = useState<PeriodKey>('30');

  const filtered = useMemo(() => {
    if (!data) return [];
    const selected = PERIODS.find((p) => p.key === period);
    if (!selected || selected.days === null) return data.daily;

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - selected.days);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    return data.daily.filter((d) => d.date >= cutoffKey);
  }, [data, period]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, d) => ({
          contactFeeXlm: acc.contactFeeXlm + d.contactFeeXlm,
          subscriptionXlm: acc.subscriptionXlm + d.subscriptionXlm,
          totalXlm: acc.totalXlm + d.totalXlm,
        }),
        { contactFeeXlm: 0, subscriptionXlm: 0, totalXlm: 0 },
      ),
    [filtered],
  );

  return (
    <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Fee Revenue</h2>
          <p className="text-sm text-gray-400 mt-1">
            Pay-to-contact and subscription fees, sourced from indexed
            fee-payment events.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-700 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-md text-sm transition ${
                period === p.key
                  ? 'bg-brand-green text-black font-semibold'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-400">
          Failed to load fee revenue. The indexer may be unavailable.
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No fee revenue in this period"
          description="Contact-fee and subscription payments will appear here as they occur."
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Contact Fees</p>
              <p className="text-lg font-semibold text-white">
                {formatXlm(totals.contactFeeXlm)} XLM
              </p>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Subscriptions</p>
              <p className="text-lg font-semibold text-white">
                {formatXlm(totals.subscriptionXlm)} XLM
              </p>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Total</p>
              <p className="text-lg font-semibold text-white">
                {formatXlm(totals.totalXlm)} XLM
              </p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={filtered}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                minTickGap={24}
              />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} width={40} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: '#E5E7EB' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9CA3AF' }} />
              <Bar
                dataKey="contactFeeXlm"
                name="Contact Fees"
                stackId="fees"
                fill={BRAND_GREEN}
              />
              <Bar
                dataKey="subscriptionXlm"
                name="Subscriptions"
                stackId="fees"
                fill={BRAND_BLUE}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </section>
  );
}
