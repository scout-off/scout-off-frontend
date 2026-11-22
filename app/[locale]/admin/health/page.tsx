'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/components/ui/Toast';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { useContractHealth } from '@/hooks/useContractHealth';
import type {
  AggregateHealthResponse,
  SubsystemHealth,
} from '@/app/api/admin/health/route';
import type { DependencyCheck } from '@/lib/healthChecks';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate, formatNumber } from '@/lib/localeFormat';
import type { Locale } from '@/lib/locales';

const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;

// Matches useContractStatus's own poll interval (hooks/useContractStatus.ts)
// so every section of this page refreshes on a consistent cadence.
const REFRESH_INTERVAL_MS = 60_000;

type CheckStatus =
  | 'ok'
  | 'starting'
  | 'degraded'
  | 'unhealthy'
  | 'unreachable'
  | 'not_configured'
  | 'loading';

const STATUS_CLASS: Record<CheckStatus, string> = {
  ok: 'text-brand-green',
  starting: 'text-gray-300',
  degraded: 'text-yellow-400',
  unhealthy: 'text-red-400',
  unreachable: 'text-red-400',
  not_configured: 'text-gray-400',
  loading: 'text-gray-400',
};

function StatusBadge({ status }: { status: CheckStatus }) {
  const t = useTranslations('admin.health.status');
  return (
    <span className={`font-medium ${STATUS_CLASS[status]}`}>{t(status)}</span>
  );
}

// English labels double as stable test ids; product names stay untranslated.
const DEPENDENCY_LABELS: Record<string, string> = {
  redis: 'Redis',
  pinata: 'Pinata',
  sessionStore: 'Session Store',
  sorobanRpc: 'Soroban RPC',
  contract: 'Contract Version',
};
const TRANSLATED_DEPENDENCIES = new Set(['sessionStore', 'contract']);

function DependencyChecks({
  checks,
}: {
  checks: Record<string, DependencyCheck>;
}) {
  const t = useTranslations('admin.health');
  const locale = useLocale() as Locale;
  return (
    <>
      {Object.entries(checks).map(([name, check]) => (
        <HealthSection
          key={name}
          testId={DEPENDENCY_LABELS[name] ?? name}
          title={
            TRANSLATED_DEPENDENCIES.has(name)
              ? t(`deps.${name}`)
              : (DEPENDENCY_LABELS[name] ?? name)
          }
          status={check.status}
        >
          <p className="text-sm text-gray-400">
            {t('latency')}{' '}
            <span className="text-gray-200">
              {t('latency_ms', { ms: formatNumber(check.latencyMs, locale) })}
            </span>
          </p>
          {check.error && <p className="text-sm text-red-400">{check.error}</p>}
          {check.status !== 'ok' && check.hint && (
            <p className="text-sm text-gray-400">{check.hint}</p>
          )}
        </HealthSection>
      ))}
    </>
  );
}

function emptySubsystem(error: string): SubsystemHealth {
  return { status: 'unreachable', error };
}

function HealthSection({
  title,
  testId,
  status,
  children,
}: {
  title: string;
  /** Stable, untranslated identifier for the section's data-testid. */
  testId: string;
  status: CheckStatus;
  children?: React.ReactNode;
}) {
  return (
    <section
      data-testid={`health-section-${testId.toLowerCase().replace(/\s+/g, '-')}`}
      className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <StatusBadge status={status} />
      </div>
      {children}
    </section>
  );
}

function HealthDashboardContent() {
  const locale = useLocale() as Locale;
  const t = useTranslations('admin.health');
  const tAdmin = useTranslations('admin');
  const { publicKey } = useWallet();
  const router = useRouter();
  const { show } = useToast();

  const {
    healthy: contractHealthy,
    paused: contractPaused,
    loading: contractLoading,
  } = useContractHealth();

  const [remoteHealth, setRemoteHealth] =
    useState<AggregateHealthResponse | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [remoteFetchError, setRemoteFetchError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchRemoteHealth = useCallback(async () => {
    setRemoteLoading(true);
    try {
      const res = await fetch('/api/admin/health', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        throw new Error(t('admin_session_required'));
      }
      if (!res.ok) {
        throw new Error(t('request_failed_status', { status: res.status }));
      }
      const data: AggregateHealthResponse = await res.json();
      setRemoteHealth(data);
      setRemoteFetchError(null);
    } catch (err) {
      // The aggregate route itself may be unreachable (e.g. offline, server
      // error) — that must not blank the page. Fall back to explicit
      // "unreachable" states for both remote checks and keep rendering.
      const message = err instanceof Error ? err.message : t('request_failed');
      setRemoteFetchError(message);
      setRemoteHealth({
        indexer: emptySubsystem(message),
        backend: emptySubsystem(message),
        checks: {},
        checkedAt: Date.now(),
      });
    } finally {
      setRemoteLoading(false);
      setLastChecked(new Date());
    }
  }, [t]);

  // Gate: redirect non-admin wallets, mirroring app/[locale]/admin/page.tsx.
  useEffect(() => {
    if (!publicKey) return;
    if (publicKey !== ADMIN_ADDRESS) {
      show({
        message: tAdmin('unauthorized_message'),
        variant: 'error',
      });
      router.replace('/');
    }
  }, [publicKey, router, show, tAdmin]);

  useEffect(() => {
    if (publicKey !== ADMIN_ADDRESS) return;
    fetchRemoteHealth();
    const interval = setInterval(fetchRemoteHealth, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [publicKey, fetchRemoteHealth]);

  if (!publicKey || publicKey !== ADMIN_ADDRESS) return null;

  const contractStatus: CheckStatus = contractLoading
    ? 'loading'
    : !contractHealthy
      ? 'unreachable'
      : contractPaused
        ? 'degraded'
        : 'ok';

  const indexerStatus: CheckStatus = remoteHealth
    ? remoteHealth.indexer.status
    : 'loading';
  const backendStatus: CheckStatus = remoteHealth
    ? remoteHealth.backend.status
    : 'loading';

  const indexerDetail = remoteHealth?.indexer.detail;
  const backendDetail = remoteHealth?.backend.detail;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
        <button
          onClick={fetchRemoteHealth}
          disabled={remoteLoading}
          className="px-4 py-2 rounded-lg bg-gray-700 text-gray-200 text-sm font-semibold hover:bg-gray-600 transition disabled:opacity-40"
        >
          {remoteLoading ? t('refreshing') : t('refresh')}
        </button>
      </div>

      <p className="text-sm text-gray-400" data-testid="health-last-checked">
        {t('last_checked')}{' '}
        {lastChecked
          ? formatDate(lastChecked, locale, {
              dateStyle: undefined,
              timeStyle: 'medium',
            })
          : t('never')}
      </p>

      <HealthSection
        title={t('contract')}
        testId="Contract"
        status={contractStatus}
      >
        {contractPaused && (
          <p className="text-sm text-yellow-400">
            {t('circuit_breaker_engaged')}
          </p>
        )}
        {!contractLoading && !contractHealthy && (
          <p className="text-sm text-red-400">{t('contract_rpc_failing')}</p>
        )}
      </HealthSection>

      <HealthSection
        title={t('indexer')}
        testId="Indexer"
        status={indexerStatus}
      >
        {remoteHealth?.indexer.error && (
          <p className="text-sm text-red-400">{remoteHealth.indexer.error}</p>
        )}
        {indexerDetail && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-400">
            {typeof indexerDetail.lastLedger !== 'undefined' && (
              <>
                <dt>{t('last_ledger')}</dt>
                <dd className="text-gray-200">
                  {String(indexerDetail.lastLedger)}
                </dd>
              </>
            )}
            {typeof indexerDetail.uptime !== 'undefined' && (
              <>
                <dt>{t('uptime')}</dt>
                <dd className="text-gray-200">
                  {t('uptime_seconds', {
                    seconds: String(indexerDetail.uptime),
                  })}
                </dd>
              </>
            )}
            {typeof indexerDetail.ledgerLag !== 'undefined' && (
              <>
                <dt>{t('ledger_lag')}</dt>
                <dd className="text-gray-200">
                  {String(indexerDetail.ledgerLag)}
                </dd>
              </>
            )}
            {typeof indexerDetail.pollerRunning === 'boolean' && (
              <>
                <dt>{t('poller')}</dt>
                <dd className="text-gray-200">
                  {indexerDetail.pollerRunning ? t('running') : t('stopped')}
                </dd>
              </>
            )}
            {typeof indexerDetail.lastError === 'string' && (
              <>
                <dt>{t('last_error')}</dt>
                <dd className="break-words text-red-300">
                  {indexerDetail.lastError}
                </dd>
              </>
            )}
          </dl>
        )}
      </HealthSection>

      <HealthSection
        title={t('backend')}
        testId="Backend API"
        status={backendStatus}
      >
        {remoteHealth?.backend.error && (
          <p className="text-sm text-red-400">{remoteHealth.backend.error}</p>
        )}
        {backendDetail && Object.keys(backendDetail).length > 0 && (
          <pre className="text-xs text-gray-400 overflow-x-auto">
            {JSON.stringify(backendDetail, null, 2)}
          </pre>
        )}
      </HealthSection>

      {remoteHealth?.checks && (
        <DependencyChecks checks={remoteHealth.checks} />
      )}

      {remoteFetchError && (
        <p className="text-xs text-gray-400">
          {t.rich('proxy_note', {
            code: (chunks) => <code>{chunks}</code>,
            error: remoteFetchError,
          })}
        </p>
      )}
    </div>
  );
}

export default function HealthDashboard() {
  return (
    <ErrorBoundary>
      <HealthDashboardContent />
    </ErrorBoundary>
  );
}
