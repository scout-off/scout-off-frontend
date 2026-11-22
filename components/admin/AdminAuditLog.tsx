'use client';
import { useMemo, useState } from 'react';
import { useAdminAuditLog } from '@/hooks/useAdminAuditLog';
import { buildAuditLogCsv } from '@/lib/auditLogCsv';
import {
  ADMIN_AUDIT_ACTION_TYPES,
  type AdminAuditActionType,
} from '@/lib/adminAudit';
import TruncatedAddress from '@/components/ui/TruncatedAddress';
import EmptyState from '@/components/ui/EmptyState';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime, formatNumber } from '@/lib/localeFormat';
import type { Locale } from '@/lib/locales';

const STROOPS_PER_XLM = 10_000_000;

function toUnixSeconds(dateInputValue: string): number | undefined {
  if (!dateInputValue) return undefined;
  const ms = new Date(dateInputValue).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Unified audit view for all admin action types (issue #670) — validator
 * add/remove, fee withdrawal, and pause/unpause, filterable by type and
 * time range, exportable as CSV, with a non-dismissible mismatch banner
 * when reconciliation against on-chain state finds drift. See
 * docs/admin-audit-log.md for the reconciliation design, including how a
 * direct-CLI contract call (outside this admin panel) still gets caught.
 */
export default function AdminAuditLog() {
  const locale = useLocale() as Locale;
  const t = useTranslations('admin.audit_log');
  const tLogs = useTranslations('admin.logs');
  const tAdmin = useTranslations('admin');
  const {
    entries,
    nextCursor = null,
    loadingMore = false,
    loading,
    error,
    errorMessage,
    filter,
    setFilter,
    loadMore = () => {},
    reconciliation,
    reconciling,
    runReconciliation,
    reconciliationHistory,
    reconciliationHistoryLoading,
  } = useAdminAuditLog();

  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const mismatches = reconciliation?.mismatches ?? [];

  const applyDateFilter = () => {
    setFilter({
      ...filter,
      from: toUnixSeconds(fromInput),
      to: toUnixSeconds(toInput),
    });
  };

  const handleExport = () => {
    downloadCsv(buildAuditLogCsv(entries), 'admin-audit-log.csv');
  };

  const lastChecked = useMemo(() => {
    if (!reconciliation) return null;
    return formatDateTime(reconciliation.checkedAt * 1000, locale);
  }, [reconciliation, locale]);

  return (
    <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{t('title')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('description')}</p>
      </div>

      {mismatches.length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-red-700 bg-red-950/40 p-4 flex flex-col gap-2"
        >
          <strong className="text-red-400 font-semibold">
            {t('mismatches', { count: mismatches.length })}
          </strong>
          <ul className="flex flex-col gap-1">
            {mismatches.map((m, i) => (
              <li key={i} className="text-sm text-red-200">
                {m.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reconciliation?.skipped && reconciliation.skipped.length > 0 && (
        <p className="text-xs text-yellow-400 bg-yellow-950/30 border border-yellow-800 rounded-md px-3 py-2">
          {reconciliation.skipped.join(' · ')}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          {t('action_type')}
          <select
            className="input"
            value={filter.actionType ?? ''}
            onChange={(e) =>
              setFilter({
                ...filter,
                actionType: (e.target.value || undefined) as
                  | AdminAuditActionType
                  | undefined,
              })
            }
          >
            <option value="">{tLogs('all')}</option>
            {ADMIN_AUDIT_ACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`actions.${type}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-400">
          {tLogs('from')}
          <input
            type="date"
            className="input"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-400">
          {tLogs('to')}
          <input
            type="date"
            className="input"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
          />
        </label>

        <button
          onClick={applyDateFilter}
          className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-brand-green transition text-sm"
        >
          {tLogs('apply')}
        </button>

        <button
          onClick={runReconciliation}
          disabled={reconciling}
          className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-brand-green transition text-sm disabled:opacity-50"
        >
          {reconciling ? t('checking') : t('run_reconciliation')}
        </button>

        <button
          onClick={handleExport}
          disabled={loading || entries.length === 0}
          className="ml-auto px-4 py-2 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition text-sm disabled:opacity-40"
        >
          {tLogs('export_csv')}
        </button>
      </div>

      {lastChecked && (
        <p className="text-xs text-gray-600">
          {t('last_checked', { time: lastChecked })}
        </p>
      )}

      {/* Reconciliation history (issue #1188): every past run, not just the
          latest live result the banner above shows — including runs
          triggered by an external scheduler while no admin had this panel
          open. See docs/admin-audit-log.md. */}
      <div className="rounded-lg border border-gray-800">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-300 hover:text-white transition"
        >
          <span>
            {reconciliationHistory.length > 0
              ? t('history_count', { count: reconciliationHistory.length })
              : t('history')}
          </span>
          <span aria-hidden="true">{showHistory ? '−' : '+'}</span>
        </button>

        {showHistory && (
          <div className="border-t border-gray-800 px-4 py-3">
            {reconciliationHistoryLoading ? (
              <p className="text-sm text-gray-400">{t('loading_history')}</p>
            ) : reconciliationHistory.length === 0 ? (
              <p className="text-sm text-gray-400">{t('no_runs')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase tracking-wide border-b border-gray-800">
                      <th className="py-2 pr-4">{t('checked_at')}</th>
                      <th className="py-2 pr-4">{t('mismatches_header')}</th>
                      <th className="py-2 pr-4">{t('new')}</th>
                      <th className="py-2 pr-4">{t('types')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {reconciliationHistory.map((run) => {
                      const kinds = Array.from(
                        new Set(run.mismatches.map((m) => m.kind)),
                      );
                      return (
                        <tr key={run.id}>
                          <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">
                            {formatDateTime(run.checkedAt * 1000, locale)}
                          </td>
                          <td className="py-2 pr-4">
                            <span
                              className={
                                run.mismatches.length > 0
                                  ? 'text-red-400 font-medium'
                                  : 'text-brand-green'
                              }
                            >
                              {run.mismatches.length}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-gray-400">
                            {run.newMismatchCount > 0 ? (
                              <span className="text-amber-400 font-medium">
                                {run.newMismatchCount}
                              </span>
                            ) : (
                              0
                            )}
                          </td>
                          <td className="py-2 pr-4 text-gray-500">
                            {kinds.length > 0 ? kinds.join(', ') : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{tAdmin('loading')}</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage ?? t('load_failed')}
        </p>
      ) : entries.length === 0 ? (
        <EmptyState
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-gray-400 text-xs uppercase tracking-wide border-b border-gray-800">
                <th className="py-2 pr-4">{tLogs('time')}</th>
                <th className="py-2 pr-4">{tLogs('action')}</th>
                <th className="py-2 pr-4">{t('admin')}</th>
                <th className="py-2 pr-4">{t('target')}</th>
                <th className="py-2 pr-4">{t('amount')}</th>
                <th className="py-2 pr-4">{t('status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">
                    {formatDateTime(entry.timestamp * 1000, locale)}
                  </td>
                  <td className="py-2 pr-4 text-gray-200">
                    {t(`actions.${entry.actionType}`)}
                  </td>
                  <td className="py-2 pr-4 font-mono">
                    <TruncatedAddress
                      address={entry.adminWallet}
                      className="text-gray-400"
                    />
                  </td>
                  <td className="py-2 pr-4 font-mono">
                    {entry.target ? (
                      <TruncatedAddress
                        address={entry.target}
                        className="text-gray-400"
                      />
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-gray-400">
                    {entry.amountStroops !== null
                      ? t('xlm_amount', {
                          amount: formatNumber(
                            entry.amountStroops / STROOPS_PER_XLM,
                            locale,
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          ),
                        })
                      : '—'}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        entry.status === 'failed'
                          ? 'text-red-400'
                          : entry.status === 'confirmed'
                            ? 'text-brand-green'
                            : 'text-gray-400'
                      }
                    >
                      {t(`statuses.${entry.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nextCursor !== null && (
            <div className="border-t border-gray-800 px-4 py-3">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-brand-green transition text-sm disabled:opacity-50"
              >
                {loadingMore ? tAdmin('loading') : t('load_more')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
