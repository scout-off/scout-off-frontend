'use client';

import { useState } from 'react';
import { useValidatorActionLog } from '@/hooks/useValidatorActionLog';
import { buildValidatorActionLogCsv } from '@/lib/validatorActionLogCsv';
import TruncatedAddress from '@/components/ui/TruncatedAddress';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import DataFreshnessBadge from '@/components/ui/DataFreshnessBadge';
import { useLocale, useTranslations } from 'next-intl';
import { downloadCsv } from '@/lib/download';
import { formatDateTime } from '@/lib/localeFormat';
import type { Locale } from '@/lib/locales';

function toUnixSeconds(dateInputValue: string): number | undefined {
  if (!dateInputValue) return undefined;
  const ms = new Date(dateInputValue).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

export default function ValidatorActionLog() {
  const locale = useLocale() as Locale;
  const t = useTranslations('admin.validator_log');
  const tLogs = useTranslations('admin.logs');
  const tAdmin = useTranslations('admin');
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
        <h2 className="text-lg font-semibold text-white">{t('title')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('description')}</p>
        <DataFreshnessBadge className="mt-2" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          {tLogs('validator')}
          <select
            className="input"
            value={filter.validator ?? ''}
            onChange={(e) =>
              setFilter({ ...filter, validator: e.target.value || undefined })
            }
          >
            <option value="">{tLogs('all')}</option>
            {validators.map((v) => (
              <option key={v} value={v}>
                {v.slice(0, 4)}…{v.slice(-4)}
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
          onClick={handleExport}
          disabled={loading || entries.length === 0}
          className="ml-auto px-4 py-2 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition text-sm disabled:opacity-40"
        >
          {tLogs('export_csv')}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{tAdmin('loading')}</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-400">
          {t('load_failed')}
        </p>
      ) : entries.length === 0 ? (
        <EmptyState
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <DataTable
          caption="Validator actions"
          captionHidden
          sortParam="validatorSort"
          rows={entries}
          rowKey={(entry) => entry.id}
          columns={[
            {
              key: 'timestamp',
              header: tLogs('time'),
              sortable: true,
              className: 'py-2 pr-4 text-gray-400 whitespace-nowrap',
              render: (entry) => formatDateTime(entry.timestamp * 1000, locale),
            },
            {
              key: 'action',
              header: tLogs('action'),
              sortable: true,
              sortValue: (entry) => t(`actions.${entry.action}`),
              render: (entry) => (
                <span
                  className={
                    entry.action === 'revoked'
                      ? 'text-red-400'
                      : 'text-brand-green'
                  }
                >
                  {t(`actions.${entry.action}`)}
                </span>
              ),
            },
            {
              key: 'validator',
              header: tLogs('validator'),
              sortable: true,
              className: 'py-2 pr-4 font-mono',
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
              header: tLogs('player'),
              sortable: true,
              className: 'py-2 pr-4 text-gray-300 truncate max-w-[10rem]',
              render: (entry) =>
                entry.playerId ?? <span className="text-gray-600">—</span>,
            },
            {
              key: 'milestoneId',
              header: tLogs('milestone'),
              sortable: true,
              className: 'py-2 pr-4 text-gray-300 truncate max-w-[10rem]',
              render: (entry) =>
                entry.milestoneId ?? <span className="text-gray-600">—</span>,
            },
          ]}
        />
      )}
    </section>
  );
}
