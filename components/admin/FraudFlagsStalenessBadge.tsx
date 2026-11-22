'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { fetchFraudFlagsStatus } from '@/lib/api';
import type { Locale } from '@/lib/locales';
import { formatNumber, formatRelativeTime } from '@/lib/localeFormat';

/**
 * Minimal proactive-surfacing mechanism for issue #1007, absent any
 * existing outbound-notification channel (email/Slack/push) in this
 * codebase: a visible badge in the admin dashboard header showing when
 * fraud-flag evaluation last ran (manual or cron-triggered) and flipping
 * to a warning style once that run is older than STALE_THRESHOLD_MS —
 * distinguishing "checked recently, nothing found" from "hasn't been
 * checked in a while, may be stale" without requiring an admin to open
 * FraudFlagsPanel.tsx first.
 */
const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

export default function FraudFlagsStalenessBadge() {
  const t = useTranslations('admin.fraud_badge');
  const locale = useLocale() as Locale;
  const [status, setStatus] = useState<{
    evaluatedAt: number | null;
    highSeverityCount: number;
    eventsProcessed?: number;
    durationMs?: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFraudFlagsStatus()
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch(() => {
        // Best-effort indicator — a failed status check shouldn't block or
        // clutter the rest of the admin dashboard.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status || status.evaluatedAt === null) return null;

  const age = Date.now() - status.evaluatedAt;
  const stale = age > STALE_THRESHOLD_MS;
  const hasHighSeverity = status.highSeverityCount > 0;

  const style = stale
    ? 'border-yellow-600 bg-yellow-950/30 text-yellow-400'
    : hasHighSeverity
      ? 'border-red-600 bg-red-950/30 text-red-400'
      : 'border-gray-700 bg-gray-900 text-gray-400';

  const durationSec =
    status.durationMs !== undefined && status.durationMs > 0
      ? t('duration', {
          value: formatNumber(status.durationMs / 1000, locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
        })
      : null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${style}`}
      title={t('title')}
    >
      {t('label', { age: formatRelativeTime(status.evaluatedAt, locale) })}
      {hasHighSeverity &&
        ` · ${t('high', { count: status.highSeverityCount })}`}
      {status.eventsProcessed !== undefined &&
        status.eventsProcessed > 0 &&
        ` · ${t('events', { count: status.eventsProcessed })}`}
      {durationSec && ` (${durationSec})`}
      {stale && ` · ${t('stale')}`}
    </span>
  );
}
