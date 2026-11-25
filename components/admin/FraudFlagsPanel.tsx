'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchFraudFlags,
  fetchFraudThrottles,
  liftFraudThrottle,
  dismissFraudFlag,
} from '@/lib/api';
import EmptyState from '@/components/ui/EmptyState';
import TruncatedAddress from '@/components/ui/TruncatedAddress';
import { useToast } from '@/components/ui/Toast';
import type { FraudFlag, FraudFlagSeverity, FraudThrottle } from '@/types';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime, formatNumber } from '@/lib/localeFormat';
import type { Locale } from '@/lib/locales';

const SEVERITY_STYLES: Record<FraudFlagSeverity, string> = {
  high: 'border-red-500 bg-red-950/30 text-red-400',
  medium: 'border-yellow-500 bg-yellow-950/30 text-yellow-400',
  low: 'border-gray-600 bg-gray-900 text-gray-400',
};

function SeverityBadge({ severity }: { severity: FraudFlagSeverity }) {
  const t = useTranslations('admin.severity');
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${SEVERITY_STYLES[severity]}`}
    >
      {t(severity)}
    </span>
  );
}

function FlagCard({
  flag,
  onDismiss,
  dismissing,
  onRemoveValidator,
}: {
  flag: FraudFlag;
  onDismiss: (flag: FraudFlag, note: string) => void;
  dismissing: boolean;
  onRemoveValidator?: (address: string) => void;
}) {
  const t = useTranslations('admin.fraud');
  const [showDismissForm, setShowDismissForm] = useState(false);
  const [note, setNote] = useState('');

  return (
    <li className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <SeverityBadge severity={flag.severity} />
          <span className="text-xs text-gray-400 uppercase tracking-wide">
            {t(`categories.${flag.category}`)}
          </span>
          <span className="text-xs text-gray-600 font-mono">
            {flag.heuristic}
          </span>
        </div>
        {!showDismissForm && (
          <div className="flex items-center gap-2">
            {flag.category === 'validator' && onRemoveValidator && (
              <button
                type="button"
                onClick={() => onRemoveValidator(flag.wallets[0])}
                className="text-xs font-medium rounded-md border border-red-700 px-3 py-1 text-red-400 hover:bg-red-950/40"
              >
                {t('remove_validator')}
              </button>
            )}
            <button
              type="button"
              disabled={dismissing}
              onClick={() => setShowDismissForm(true)}
              className="text-xs font-medium rounded-md border border-gray-700 px-3 py-1 text-gray-200 hover:bg-gray-800 disabled:opacity-50"
            >
              {t('dismiss')}
            </button>
          </div>
        )}
      </div>

      <p className="text-sm text-gray-200">{flag.reason}</p>

      <div className="flex flex-wrap gap-2">
        {flag.wallets.map((wallet, i) => (
          <TruncatedAddress
            key={`${wallet}-${i}`}
            address={wallet}
            className="text-gray-400"
          />
        ))}
      </div>

      <details className="text-xs text-gray-400">
        <summary className="cursor-pointer select-none hover:text-gray-300">
          {t('evidence')}
        </summary>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {Object.entries(flag.evidence).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-gray-600">{key}</dt>
              <dd className="text-gray-300 break-all">
                {Array.isArray(value) ? value.join(', ') : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      </details>

      {showDismissForm && (
        <div className="flex flex-col gap-2 border-t border-gray-800 pt-3">
          <label
            className="text-xs text-gray-400"
            htmlFor={`dismiss-note-${flag.id}`}
          >
            {t('dismiss_note_label')}
          </label>
          <textarea
            id={`dismiss-note-${flag.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('dismiss_note_placeholder')}
            rows={2}
            className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200 placeholder:text-gray-600"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              disabled={dismissing}
              onClick={() => {
                setShowDismissForm(false);
                setNote('');
              }}
              className="text-xs font-medium rounded-md border border-gray-700 px-3 py-1 text-gray-400 hover:bg-gray-800 disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={dismissing}
              onClick={() => onDismiss(flag, note)}
              className="text-xs font-medium rounded-md border border-gray-700 px-3 py-1 text-gray-200 hover:bg-gray-800 disabled:opacity-50"
            >
              {dismissing ? t('dismissing') : t('confirm_dismiss')}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function ThrottleCard({
  throttle,
  onLift,
  lifting,
}: {
  throttle: FraudThrottle;
  onLift: (id: number) => void;
  lifting: boolean;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('admin.fraud');
  const isActive = throttle.status === 'throttled';
  return (
    <li className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
              isActive
                ? 'border-red-500 bg-red-950/30 text-red-400'
                : 'border-gray-600 bg-gray-900 text-gray-400'
            }`}
          >
            {isActive ? t('throttled') : t('lifted')}
          </span>
          <span className="text-xs text-gray-600 font-mono">
            {throttle.heuristic}
          </span>
        </div>
        {isActive && (
          <button
            type="button"
            disabled={lifting}
            onClick={() => onLift(throttle.id)}
            className="text-xs font-medium rounded-md border border-gray-700 px-3 py-1 text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          >
            {lifting ? t('lifting') : t('lift_throttle')}
          </button>
        )}
      </div>

      <TruncatedAddress address={throttle.wallet} className="text-gray-400" />
      <p className="text-sm text-gray-200">{throttle.reason}</p>
      <p className="text-xs text-gray-500">
        {t('throttled_at', {
          time: formatDateTime(new Date(throttle.throttledAt), locale),
        })}
        {throttle.liftedAt && (
          <>
            {t('lifted_at', {
              time: formatDateTime(new Date(throttle.liftedAt), locale),
            })}
            {throttle.liftedBy && t('lifted_by', { who: throttle.liftedBy })}
            {throttle.liftReason &&
              t('lift_reason', { reason: throttle.liftReason })}
          </>
        )}
      </p>
    </li>
  );
}

/**
 * Surfaces the output of lib/fraudDetection.ts to admins. The flag list
 * itself remains alert-only by design (see docs/fraud-detection.md) — a
 * flag alone never blocks anything. The one exception is issue #1174's
 * admin-gated auto-throttling: when NEXT_PUBLIC_FEATURE_FRAUD_AUTO_THROTTLE
 * is on, cross_scout_redeemer_ring and self_redemption flags at 'high'
 * severity place a wallet in a throttled state automatically, and this is
 * the ONLY surface that can lift it — there is no automatic expiry anywhere
 * in this codebase.
 */
const REFRESH_COOLDOWN_MS = 5_000;

export default function FraudFlagsPanel({
  onRemoveValidator,
}: {
  /** Opens the admin's existing confirm-and-sign remove-validator flow. */
  onRemoveValidator?: (address: string) => void;
} = {}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('admin.fraud');
  const tAdmin = useTranslations('admin');
  const [flags, setFlags] = useState<FraudFlag[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [evaluatedAt, setEvaluatedAt] = useState<number | null>(null);
  const [runStats, setRunStats] = useState<{
    eventsProcessed?: number;
    durationMs?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshCooldownMs, setRefreshCooldownMs] = useState(0);

  const [throttles, setThrottles] = useState<FraudThrottle[]>([]);
  const [throttlesLoading, setThrottlesLoading] = useState(true);
  const [liftingId, setLiftingId] = useState<number | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const { show: showToast } = useToast();

  const loadThrottles = useCallback(() => {
    setThrottlesLoading(true);
    fetchFraudThrottles()
      .then(({ throttles }) => setThrottles(throttles))
      .catch(() => {
        // No feature-specific error surface here — an admin who never
        // enables NEXT_PUBLIC_FEATURE_FRAUD_AUTO_THROTTLE just sees an
        // empty throttle list, which is indistinguishable from "no store
        // rows yet" and requires no separate messaging.
      })
      .finally(() => setThrottlesLoading(false));
  }, []);

  const loadFlags = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchFraudFlags()
      .then(({ flags, warnings, evaluatedAt, eventsProcessed, durationMs }) => {
        if (cancelled) return;
        setFlags(flags);
        setWarnings(warnings);
        setEvaluatedAt(evaluatedAt);
        if (eventsProcessed !== undefined || durationMs !== undefined) {
          setRunStats({ eventsProcessed, durationMs });
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = loadFlags();
    loadThrottles();
    return cleanup;
  }, [loadFlags, loadThrottles]);

  useEffect(() => {
    if (refreshCooldownMs <= 0) return;
    const tick = window.setInterval(() => {
      setRefreshCooldownMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [refreshCooldownMs]);

  const refreshFlags = useCallback(async () => {
    if (loading || refreshCooldownMs > 0) return;
    setRefreshCooldownMs(REFRESH_COOLDOWN_MS);
    const cleanup = loadFlags();
    loadThrottles();
    return cleanup;
  }, [loadFlags, loadThrottles, loading, refreshCooldownMs]);

  async function handleLift(id: number) {
    setLiftingId(id);
    try {
      await liftFraudThrottle(id);
      showToast({ message: t('throttle_lifted'), variant: 'success' });
      loadThrottles();
    } catch {
      showToast({ message: t('lift_failed'), variant: 'error' });
    } finally {
      setLiftingId(null);
    }
  }

  /**
   * Dismissal is content-keyed, not id-keyed (issue #1171) — there is no
   * database row to reference until it's persisted by the API. On success,
   * the flag is removed from local state immediately (the same content-key
   * would also just be filtered out by the next GET /api/admin/fraud-flags
   * load, but doing it here avoids waiting on a re-fetch).
   */
  async function handleDismiss(flag: FraudFlag, note: string) {
    setDismissingId(flag.id);
    try {
      await dismissFraudFlag(flag, note.trim() || undefined);
      showToast({ message: t('flag_dismissed'), variant: 'success' });
      setFlags((prev) => prev.filter((f) => f.id !== flag.id));
    } catch {
      showToast({ message: t('dismiss_failed'), variant: 'error' });
    } finally {
      setDismissingId(null);
    }
  }

  const activeThrottles = throttles.filter((t) => t.status === 'throttled');
  const liftedThrottles = throttles.filter((t) => t.status === 'lifted');

  return (
    <>
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{t('title')}</h2>
            <p className="text-sm text-gray-400 mt-1">{t('description')}</p>
            {evaluatedAt !== null && (
              <p className="text-xs text-gray-500 mt-2">
                {t('as_of', { time: formatDateTime(evaluatedAt, locale) })}
                {runStats && (
                  <>
                    {runStats.eventsProcessed !== undefined &&
                      runStats.eventsProcessed > 0 &&
                      t('events_processed', {
                        count: formatNumber(runStats.eventsProcessed, locale),
                      })}
                    {runStats.durationMs !== undefined &&
                      runStats.durationMs > 0 &&
                      t('duration', {
                        seconds: formatNumber(
                          runStats.durationMs / 1000,
                          locale,
                          {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          },
                        ),
                      })}
                  </>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={refreshFlags}
            disabled={loading || refreshCooldownMs > 0}
            className="shrink-0 rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? t('refreshing')
              : refreshCooldownMs > 0
                ? t('refresh_cooldown', {
                    seconds: Math.ceil(refreshCooldownMs / 1000),
                  })
                : t('refresh')}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">{tAdmin('loading')}</p>
        ) : error ? (
          <p role="alert" className="text-sm text-red-400">
            {t('load_failed')}
          </p>
        ) : (
          <>
            {warnings.map((warning) => (
              <p
                key={warning}
                role="status"
                className="text-xs text-yellow-400 bg-yellow-950/30 border border-yellow-800 rounded-md px-3 py-2"
              >
                {warning}
              </p>
            ))}

            {flags.some(
              (f) => f.category === 'validator' && f.severity === 'high',
            ) && (
              <p
                role="alert"
                className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-md px-3 py-2"
              >
                {t('validator_compromised')}
              </p>
            )}

            {flags.length === 0 ? (
              <EmptyState
                title={t('empty_title')}
                description={t('empty_description')}
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {flags.map((flag) => (
                  <FlagCard
                    key={flag.id}
                    flag={flag}
                    onDismiss={handleDismiss}
                    dismissing={dismissingId === flag.id}
                    onRemoveValidator={onRemoveValidator}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {!throttlesLoading && throttles.length > 0 && (
        <ThrottlesSection
          activeThrottles={activeThrottles}
          liftedThrottles={liftedThrottles}
          liftingId={liftingId}
          onLift={handleLift}
        />
      )}
    </>
  );
}

function ThrottlesSection({
  activeThrottles,
  liftedThrottles,
  liftingId,
  onLift,
}: {
  activeThrottles: FraudThrottle[];
  liftedThrottles: FraudThrottle[];
  liftingId: number | null;
  onLift: (id: number) => void;
}) {
  const tr = useTranslations('admin.fraud');
  return (
    <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-white">
          {tr('throttles_title')}
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          {tr('throttles_description')}
        </p>
      </div>

      {activeThrottles.length > 0 && (
        <ul className="flex flex-col gap-3">
          {activeThrottles.map((t) => (
            <ThrottleCard
              key={t.id}
              throttle={t}
              onLift={onLift}
              lifting={liftingId === t.id}
            />
          ))}
        </ul>
      )}

      {liftedThrottles.length > 0 && (
        <details className="text-xs text-gray-400">
          <summary className="cursor-pointer select-none hover:text-gray-300">
            {tr('lift_history', { count: liftedThrottles.length })}
          </summary>
          <ul className="flex flex-col gap-3 mt-3">
            {liftedThrottles.map((t) => (
              <ThrottleCard
                key={t.id}
                throttle={t}
                onLift={onLift}
                lifting={false}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
