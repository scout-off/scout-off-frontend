'use client';

import { useState } from 'react';
import { useValidatorActionLog } from '@/hooks/useValidatorActionLog';
import { buildValidatorActionLogCsv } from '@/lib/validatorActionLogCsv';
import TruncatedAddress from '@/components/ui/TruncatedAddress';
import EmptyState from '@/components/ui/EmptyState';
import DataTable from '@/components/ui/DataTable';
import DataFreshnessBadge from '@/components/ui/DataFreshnessBadge';
import { useLocale } from 'next-intl';

const ACTION_LABELS = {
  approved: 'Approved',
  revoked: 'Revoked',
} as const;

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

export default function ValidatorActionLog() {
  const locale = useLocale();
  const { entries, validators, loading, error, filter, setFilter } =
    useValidatorActionLog();

  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');

  const applyDateFilter = () => {
    setFilter({
      ...filter,
      from: toUnixSeconds(fromInput),
      to: toUnixSeconds(toInput),
    });
  };

  const handleExport = () => {
    downloadCsv(
      buildValidatorActionLogCsv(entries),
      'validator-action-log.csv',
    );
  };

  return (
    <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-white">
          Validator Action Log
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Milestone approve/revoke actions across all players, sourced from
          indexed contract events.
        </p>
        <DataFreshnessBadge className="mt-2" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Validator
          <select
            className="input"
            value={filter.validator ?? ''}
            onChange={(e) =>
              setFilter({ ...filter, validator: e.target.value || undefined })
            }
          >
            <option value="">All</option>
            {validators.map((v) => (
              <option key={v} value={v}>
                {v.slice(0, 4)}…{v.slice(-4)}
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
          onClick={handleExport}
          disabled={loading || entries.length === 0}
          className="ml-auto px-4 py-2 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition text-sm disabled:opacity-40"
        >
          Export as CSV
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-400">
          Failed to load validator action log. The indexer may be unavailable.
        </p>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No validator actions recorded"
          description="Milestone approvals and revocations will appear here as validators act on players."
        />
      ) : (
        <DataTable
          caption="Validator actions"
          captionHidden
          sortParam="validatorSort"
          rows={entries}
          rowKey={(entry) => entry.id}
          headerRowClassName="text-gray-400 text-xs uppercase tracking-wide border-b border-gray-800"
          rowClassName="border-b border-gray-800"
          columns={[
            {
              key: 'timestamp',
              header: 'Time',
              sortable: true,
              headerClassName: 'py-2 pr-4',
              cellClassName: 'py-2 pr-4 text-gray-400 whitespace-nowrap',
              render: (entry) =>
                new Date(entry.timestamp * 1000).toLocaleString(locale),
            },
            {
              key: 'action',
              header: 'Action',
              sortable: true,
              headerClassName: 'py-2 pr-4',
              cellClassName: 'py-2 pr-4',
              render: (entry) => (
                <span
                  className={
                    entry.action === 'revoked'
                      ? 'text-red-400'
                      : 'text-brand-green'
                  }
                >
                  {ACTION_LABELS[entry.action]}
                </span>
              ),
            },
            {
              key: 'validator',
              header: 'Validator',
              sortable: true,
              headerClassName: 'py-2 pr-4',
              cellClassName: 'py-2 pr-4 font-mono',
              render: (entry) =>
                entry.validator ? (
                  <TruncatedAddress
                    address={entry.validator}
                    className="text-gray-400"
                  />
                ) : (
                  <span className="text-gray-600">—</span>
                ),
            },
            {
              key: 'playerId',
              header: 'Player',
              sortable: true,
              headerClassName: 'py-2 pr-4',
              cellClassName: 'py-2 pr-4 text-gray-300 truncate max-w-[10rem]',
              render: (entry) =>
                entry.playerId ?? <span className="text-gray-600">—</span>,
            },
            {
              key: 'milestoneId',
              header: 'Milestone',
              headerClassName: 'py-2 pr-4',
              cellClassName: 'py-2 pr-4 text-gray-300 truncate max-w-[10rem]',
              render: (entry) =>
                entry.milestoneId ?? <span className="text-gray-600">—</span>,
            },
          ]}
        />
      )}
    </section>
  );
}
