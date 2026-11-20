'use client';

import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/Spinner';
import { AFRICAN_REGIONS } from '@/lib/regions';
import { FOOTBALL_POSITIONS } from '@/lib/positions';
import { getExplorerTxUrl } from '@/lib/network';
import type {
  ParsedRow,
  Phase,
  ResumedSessionInfo,
  RowSubmission,
  Submissions,
} from './types';

function regionLabel(value: string): string {
  return AFRICAN_REGIONS.find((r) => r.value === value)?.label ?? value;
}

function positionLabel(value: string): string {
  return FOOTBALL_POSITIONS.find((p) => p.value === value)?.label ?? value;
}

function explorerUrl(hash: string): string {
  return getExplorerTxUrl(hash);
}

function StatusBadge({
  row,
  phase,
  submission,
}: {
  row: ParsedRow;
  phase: Phase;
  submission?: RowSubmission;
}) {
  const t = useTranslations('academy.bulkImport.status');
  if (!row.isValid) {
    const label =
      phase === 'upload' || phase === 'preview' ? t('invalid') : t('skipped');
    return (
      <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300">
        {label}
      </span>
    );
  }

  if (phase === 'upload' || phase === 'preview' || !submission) {
    return (
      <span className="inline-flex items-center rounded-full border border-brand-green/40 bg-brand-green/10 px-2.5 py-1 text-xs font-medium text-brand-green">
        {t('valid')}
      </span>
    );
  }

  switch (submission.status) {
    case 'pending':
      return (
        <span className="inline-flex items-center rounded-full border border-gray-600 bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-400">
          {t('waiting')}
        </span>
      );
    case 'signing':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1 text-xs font-medium text-yellow-300">
          <Spinner size="sm" className="text-yellow-300" />
          {t('signing')}
        </span>
      );
    case 'success':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-green/40 bg-brand-green/10 px-2.5 py-1 text-xs font-medium text-brand-green">
          <span aria-hidden="true">✓</span> {t('registered')}
          {submission.txHash && (
            <a
              href={explorerUrl(submission.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80"
            >
              {t('viewTx')}
            </a>
          )}
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300">
          <span aria-hidden="true">✕</span> {t('failed')}
        </span>
      );
    default:
      return null;
  }
}

export interface ReviewStepProps {
  phase: Phase;
  rows: ParsedRow[];
  submissions: Submissions;
  validCount: number;
  invalidCount: number;
  resumedSessionInfo: ResumedSessionInfo | null;
}

/** Parsed rows with row-level errors and, once importing, per-row status. */
export default function ReviewStep({
  phase,
  rows,
  submissions,
  validCount,
  invalidCount,
  resumedSessionInfo,
}: ReviewStepProps) {
  const t = useTranslations('academy.bulkImport');

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">
          {phase === 'preview' ? t('previewHeading') : t('progressHeading')}
        </h2>
        <p className="text-sm text-gray-400">
          {t('counts', {
            valid: validCount,
            invalid: invalidCount,
            total: rows.length,
          })}
        </p>
      </div>

      {/* ── Resume banner ─────────────────────────────────────────────── */}
      {resumedSessionInfo && phase === 'preview' && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-200"
        >
          {t.rich('resumeBanner', {
            completed: resumedSessionInfo.completedRows,
            total: resumedSessionInfo.totalRows,
            strong: (chunks) => <span className="font-medium">{chunks}</span>,
          })}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <caption className="sr-only">{t('tableCaption')}</caption>
          <thead>
            <tr className="border-b border-gray-800 text-gray-400">
              <th scope="col" className="py-2 pr-4 font-medium">
                {t('columns.row')}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t('columns.name')}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t('columns.age')}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t('columns.nationality')}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t('columns.region')}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t('columns.position')}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t('columns.status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.rowNumber}
                className="border-b border-gray-800/60 align-top"
              >
                <td className="py-2 pr-4 text-gray-400">{row.rowNumber}</td>
                <td className="py-2 pr-4 text-white">{row.data.name || '—'}</td>
                <td className="py-2 pr-4 text-gray-300">
                  {row.data.age || '—'}
                </td>
                <td className="py-2 pr-4 text-gray-300">
                  {row.data.nationality || '—'}
                </td>
                <td className="py-2 pr-4 text-gray-300">
                  {row.valid
                    ? regionLabel(row.valid.region)
                    : row.data.region || '—'}
                </td>
                <td className="py-2 pr-4 text-gray-300">
                  {row.valid
                    ? positionLabel(row.valid.position)
                    : row.data.position || '—'}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex flex-col gap-1">
                    <StatusBadge
                      row={row}
                      phase={phase}
                      submission={submissions[row.rowNumber]}
                    />
                    {row.errors.length > 0 && (
                      <ul className="text-xs text-red-400 list-disc list-inside">
                        {row.errors.map((err, i) => (
                          <li key={i}>
                            {t(`columns.${err.field}`)}:{' '}
                            {t(`rowErrors.${err.code}`, {
                              field: t(`columns.${err.field}`),
                              ...err.params,
                            })}
                          </li>
                        ))}
                      </ul>
                    )}
                    {submissions[row.rowNumber]?.status === 'failed' &&
                      submissions[row.rowNumber]?.error && (
                        <p className="text-xs text-red-400">
                          {submissions[row.rowNumber]?.error}
                        </p>
                      )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
