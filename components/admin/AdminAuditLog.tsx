'use client';
import { useMemo, useState } from 'react';
import { useAdminAuditLog } from '@/hooks/useAdminAuditLog';
import { buildAuditLogCsv } from '@/lib/auditLogCsv';
import {
  ADMIN_AUDIT_ACTION_LABELS,
  ADMIN_AUDIT_ACTION_TYPES,
  type AdminAuditActionType,
} from '@/lib/adminAudit';
import TruncatedAddress from '@/components/ui/TruncatedAddress';
import EmptyState from '@/components/ui/EmptyState';

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
    return new Date(reconciliation.checkedAt * 1000).toLocaleString();
  }, [reconciliation]);

  return (
    <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Admin Audit Log</h2>
        <p className="text-sm text-gray-400 mt-1">
          Validator add/remove, fee withdrawal, and pause/unpause actions,
          reconciled against on-chain state.
        </p>
      </div>

      {mismatches.length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-red-700 bg-red-950/40 p-4 flex flex-col gap-2"
        >
          <strong className="text-red-400 font-semibold">
            {mismatches.length} reconciliation mismatch
            {mismatches.length !== 1 ? 'es' : ''} detected
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
          Action type
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
            <option value="">All</option>
            {ADMIN_AUDIT_ACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {ADMIN_AUDIT_ACTION_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-400">
          From
          <input
            type="date"
            className="input"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-400">
          To
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
          Apply
        </button>

        <button
          onClick={runReconciliation}
          disabled={reconciling}
          className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-brand-green transition text-sm disabled:opacity-50"
        >
          {reconciling ? 'Checking…' : 'Run Reconciliation'}
        </button>

        <button
          onClick={handleExport}
          disabled={loading || entries.length === 0}
          className="ml-auto px-4 py-2 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition text-sm disabled:opacity-40"
        >
          Export as CSV
        </button>
      </div>

      {lastChecked && (
        <p className="text-xs text-gray-600">
          Reconciliation last checked: {lastChecked}
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
            Reconciliation history
            {reconciliationHistory.length > 0 &&
              ` (${reconciliationHistory.length} run${reconciliationHistory.length !== 1 ? 's' : ''})`}
          </span>
          <span aria-hidden="true">{showHistory ? '−' : '+'}</span>
        </button>

        {showHistory && (
          <div className="border-t border-gray-800 px-4 py-3">
            {reconciliationHistoryLoading ? (
              <p className="text-sm text-gray-400">Loading history…</p>
            ) : reconciliationHistory.length === 0 ? (
              <p className="text-sm text-gray-400">
                No reconciliation runs recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase tracking-wide border-b border-gray-800">
                      <th className="py-2 pr-4">Checked at</th>
                      <th className="py-2 pr-4">Mismatches</th>
                      <th className="py-2 pr-4">New</th>
                      <th className="py-2 pr-4">Types</th>
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
                            {new Date(run.checkedAt * 1000).toLocaleString()}
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
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage ?? 'Failed to load audit log.'}
        </p>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No admin actions recorded"
          description="Validator add/remove, fee withdrawal, and pause/unpause actions will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-gray-400 text-xs uppercase tracking-wide border-b border-gray-800">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Admin</th>
                <th className="py-2 pr-4">Target</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">
                    {new Date(entry.timestamp * 1000).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-gray-200">
                    {ADMIN_AUDIT_ACTION_LABELS[entry.actionType]}
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
                      ? `${(entry.amountStroops / STROOPS_PER_XLM).toFixed(2)} XLM`
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
                      {entry.status}
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
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
