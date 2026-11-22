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
import { useFeeDriftDetection } from '@/hooks/useFeeDriftDetection';
import EmptyState from '@/components/ui/EmptyState';
import ChartDataTable from '@/components/admin/ChartDataTable';
import { percentChange } from '@/lib/chartSummary';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/lib/locales';
import { formatNumber } from '@/lib/localeFormat';

const BRAND_GREEN = '#00C853';
const BRAND_BLUE = '#3B82F6';

const PERIODS = [
  { key: '7', days: 7 },
  { key: '30', days: 30 },
  { key: '90', days: 90 },
  { key: 'all', days: null },
] as const;

type PeriodKey = (typeof PERIODS)[number]['key'];

const SUBSCRIPTION_PATTERN_ID = 'fee-revenue-subscription-stripes';

const TOOLTIP_STYLE = {
  backgroundColor: '#111827',
  border: '1px solid #374151',
  borderRadius: 8,
  fontSize: 12,
};

// Bucket keys ('YYYY-MM-DD') are fixed to UTC day boundaries (see
// hooks/useFeeRevenue.ts) so admins in different timezones see the same
// bucketing for the same data. For display only, render the label using the
// viewer's locale conventions (month/day order, abbreviation) while pinning
// `timeZone: 'UTC'` so the calendar day shown never shifts away from the
// UTC bucket it represents.
function formatBucketLabel(dateKey: string, locale: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function FeeRevenueChart() {
  const locale = useLocale() as Locale;
  const t = useTranslations('admin.fee_revenue');
  const tc = useTranslations('admin.charts');
  const xlm = (value: number) =>
    formatNumber(value, locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const { data, loading, error } = useFeeRevenue();
  const { hasDrift, warningMessage } = useFeeDriftDetection();
  const [period, setPeriod] = useState<PeriodKey>('30');

  const selectedDays = PERIODS.find((p) => p.key === period)?.days ?? null;

  const { filtered, previousTotalXlm } = useMemo(() => {
    if (!data) return { filtered: [], previousTotalXlm: null };
    if (selectedDays === null) {
      return { filtered: data.daily, previousTotalXlm: null };
    }

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - selectedDays);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    const previousCutoff = new Date(cutoff);
    previousCutoff.setUTCDate(previousCutoff.getUTCDate() - selectedDays);
    const previousKey = previousCutoff.toISOString().slice(0, 10);
    const previous = data.daily.filter(
      (d) => d.date >= previousKey && d.date < cutoffKey,
    );
    return {
      filtered: data.daily.filter((d) => d.date >= cutoffKey),
      previousTotalXlm:
        previous.length === 0
          ? null
          : previous.reduce((sum, d) => sum + d.totalXlm, 0),
    };
  }, [data, selectedDays]);

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
          <h2 className="text-lg font-semibold text-white">{t('title')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('description')}</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-700 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-md text-sm transition ${
                period === p.key
                  ? 'bg-brand-green text-black font-semibold'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              {p.days === null
                ? tc('period_all')
                : tc('period_days', { days: p.days })}
            </button>
          ))}
        </div>
      </div>

      {hasDrift && warningMessage && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-yellow-600/50 bg-yellow-950/30 p-3 text-xs text-yellow-300 flex items-start gap-2"
        >
          <span className="text-sm leading-none mt-0.5">⚠️</span>
          <span>{warningMessage}</span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">{t('loading')}</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-400">
          {t('load_failed')}
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">{t('contact_fees')}</p>
              <p className="text-lg font-semibold text-white">
                {t('xlm', { amount: xlm(totals.contactFeeXlm) })}
              </p>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">{t('subscriptions')}</p>
              <p className="text-lg font-semibold text-white">
                {t('xlm', { amount: xlm(totals.subscriptionXlm) })}
              </p>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">{t('total')}</p>
              <p className="text-lg font-semibold text-white">
                {t('xlm', { amount: xlm(totals.totalXlm) })}
              </p>
            </div>
          </div>

          <figure className="flex flex-col gap-2">
            <figcaption className="text-sm text-gray-300">
              {(() => {
                const range =
                  selectedDays === null
                    ? t('range_all')
                    : t('range_days', { days: selectedDays });
                const change =
                  previousTotalXlm === null
                    ? null
                    : percentChange(totals.totalXlm, previousTotalXlm);
                const rounded = change === null ? null : Math.round(change);
                const values = { range, total: xlm(totals.totalXlm) };
                if (rounded === null) return t('summary', values);
                const trend =
                  rounded === 0
                    ? tc('trend_unchanged')
                    : tc(rounded > 0 ? 'trend_up' : 'trend_down', {
                        value: formatNumber(Math.abs(rounded), locale),
                      });
                return t('summary_with_trend', { ...values, trend });
              })()}
            </figcaption>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={filtered}
                margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                accessibilityLayer
              >
                <defs>
                  {/* Stripes keep the two stacked series distinguishable without colour. */}
                  <pattern
                    id={SUBSCRIPTION_PATTERN_ID}
                    width={6}
                    height={6}
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width={6} height={6} fill={BRAND_BLUE} />
                    <line
                      x1={0}
                      y1={0}
                      x2={0}
                      y2={6}
                      stroke="#E5E7EB"
                      strokeWidth={2}
                    />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(label) =>
                    formatBucketLabel(String(label), locale)
                  }
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                  minTickGap={24}
                />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} width={40} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: '#E5E7EB' }}
                  labelFormatter={(label) =>
                    formatBucketLabel(String(label), locale)
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9CA3AF' }} />
                <Bar
                  dataKey="contactFeeXlm"
                  name={t('contact_fees')}
                  stackId="fees"
                  fill={BRAND_GREEN}
                  legendType="square"
                />
                <Bar
                  dataKey="subscriptionXlm"
                  name={t('subscriptions')}
                  stackId="fees"
                  fill={`url(#${SUBSCRIPTION_PATTERN_ID})`}
                  legendType="diamond"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <ChartDataTable
              caption={t('table_caption')}
              rows={filtered}
              rowKey={(d) => d.date}
              columns={[
                {
                  header: t('date'),
                  render: (d) => formatBucketLabel(d.date, locale),
                },
                {
                  header: t('contact_fees'),
                  render: (d) => xlm(d.contactFeeXlm),
                },
                {
                  header: t('subscriptions'),
                  render: (d) => xlm(d.subscriptionXlm),
                },
                { header: t('total'), render: (d) => xlm(d.totalXlm) },
              ]}
            />
          </figure>
        </>
      )}
    </section>
  );
}
