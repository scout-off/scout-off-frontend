'use client';

import { useRef, useState, ChangeEvent } from 'react';
import { useWallet } from '@/hooks/useWallet';
import useIsPaused from '@/hooks/useIsPaused';
import { buildRegisterPlayer } from '@/lib/contract';
import { parseContractError } from '@/lib/contractErrorMessage';
import {
  parseBulkImportFile,
  detectFormat,
  type ParsedRow,
} from '@/lib/bulkImportParser';
import { AFRICAN_REGIONS } from '@/lib/regions';
import { FOOTBALL_POSITIONS } from '@/components/player/PlayerOnboardingWizard';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import type { PlayerVitals } from '@/types';

// Bulk-imported players are registered without a highlight reel — per-player
// video upload is out of scope for this flow (see PR description). Players
// (or the academy, on their behalf) can add one later via the existing
// single-player profile update flow.
const NO_HIGHLIGHT_REEL_PLACEHOLDER = '';

type Phase = 'upload' | 'preview' | 'submitting' | 'done';

type RowSubmissionStatus =
  | 'pending'
  | 'signing'
  | 'success'
  | 'failed'
  | 'skipped';

interface RowSubmission {
  status: RowSubmissionStatus;
  txHash?: string | null;
  error?: string | null;
}

function regionLabel(value: string): string {
  return AFRICAN_REGIONS.find((r) => r.value === value)?.label ?? value;
}

function positionLabel(value: string): string {
  return FOOTBALL_POSITIONS.find((p) => p.value === value)?.label ?? value;
}

function explorerUrl(hash: string): string {
  const network =
    process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  return `https://stellar.expert/explorer/${network}/tx/${hash}`;
}

// ── Per-row status badge ─────────────────────────────────────────────────────

function StatusBadge({
  row,
  phase,
  submission,
}: {
  row: ParsedRow;
  phase: Phase;
  submission?: RowSubmission;
}) {
  if (!row.isValid) {
    const label =
      phase === 'upload' || phase === 'preview' ? 'Invalid' : 'Skipped';
    return (
      <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300">
        {label}
      </span>
    );
  }

  if (phase === 'upload' || phase === 'preview' || !submission) {
    return (
      <span className="inline-flex items-center rounded-full border border-brand-green/40 bg-brand-green/10 px-2.5 py-1 text-xs font-medium text-brand-green">
        Valid
      </span>
    );
  }

  switch (submission.status) {
    case 'pending':
      return (
        <span className="inline-flex items-center rounded-full border border-gray-600 bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-400">
          Waiting…
        </span>
      );
    case 'signing':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1 text-xs font-medium text-yellow-300">
          <Spinner size="sm" className="text-yellow-300" />
          Awaiting signature…
        </span>
      );
    case 'success':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-green/40 bg-brand-green/10 px-2.5 py-1 text-xs font-medium text-brand-green">
          <span aria-hidden="true">✓</span> Registered
          {submission.txHash && (
            <a
              href={explorerUrl(submission.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80"
            >
              View tx
            </a>
          )}
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300">
          <span aria-hidden="true">✕</span> Failed
        </span>
      );
    default:
      return null;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BulkPlayerImport() {
  const { publicKey, signAndSubmit } = useWallet();
  const isPaused = useIsPaused();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('upload');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [submissions, setSubmissions] = useState<Record<number, RowSubmission>>(
    {},
  );
  const [formError, setFormError] = useState<string | null>(null);

  const validRows = rows.filter((r) => r.isValid && r.valid);
  const invalidRows = rows.filter((r) => !r.isValid);

  const succeededCount = Object.values(submissions).filter(
    (s) => s.status === 'success',
  ).length;
  const failedCount = Object.values(submissions).filter(
    (s) => s.status === 'failed',
  ).length;

  const resetAll = () => {
    setPhase('upload');
    setFileName('');
    setFileError(null);
    setRows([]);
    setSubmissions({});
    setFormError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setFormError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const format = detectFormat(file.name, text);
      const result = parseBulkImportFile(text, format);

      if (result.fileError) {
        setFileError(result.fileError);
        setRows([]);
        setPhase('upload');
        return;
      }

      setRows(result.rows);
      setFileName(file.name);
      setSubmissions({});
      setPhase('preview');
    };
    reader.onerror = () => {
      setFileError('Failed to read the file. Please try again.');
    };
    reader.readAsText(file);
  };

  // ── Sequential, one-signature-per-row submission ────────────────────────────
  //
  // This flow uses ONE connected signing wallet to submit N sequential
  // `register_player` transactions — one per valid row. Each transaction
  // requires its own individual wallet approval; there is no batch-signing
  // or auto-approval on-chain. If a row's transaction fails or is rejected,
  // that row is marked failed and the batch continues to the next row rather
  // than aborting, so one bad row (or one rejected prompt) doesn't cost the
  // admin the rest of an otherwise-good batch.
  const handleImport = async () => {
    if (!publicKey) {
      setFormError('Wallet not connected');
      return;
    }
    if (isPaused) {
      setFormError('Transactions are currently disabled');
      return;
    }
    if (validRows.length === 0) return;

    setFormError(null);
    setPhase('submitting');

    const initial: Record<number, RowSubmission> = {};
    for (const r of validRows) initial[r.rowNumber] = { status: 'pending' };
    setSubmissions(initial);

    for (const r of validRows) {
      const vitals = r.valid as NonNullable<ParsedRow['valid']>;

      setSubmissions((prev) => ({
        ...prev,
        [r.rowNumber]: { status: 'signing' },
      }));

      try {
        const payload: PlayerVitals = {
          name: vitals.name,
          age: vitals.age,
          position: vitals.position,
          region: vitals.region,
          nationality: vitals.nationality,
        };
        const xdr = await buildRegisterPlayer(
          publicKey,
          payload,
          NO_HIGHLIGHT_REEL_PLACEHOLDER,
        );
        const result = await signAndSubmit(xdr);
        const hash =
          typeof result === 'string' ? result : ((result as any)?.hash ?? null);

        setSubmissions((prev) => ({
          ...prev,
          [r.rowNumber]: { status: 'success', txHash: hash },
        }));
      } catch (err) {
        setSubmissions((prev) => ({
          ...prev,
          [r.rowNumber]: { status: 'failed', error: parseContractError(err) },
        }));
      }
    }

    setPhase('done');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Bulk Player Import</h1>
        <p className="text-sm text-gray-400 mt-1">
          Upload a CSV or JSON file listing multiple players to register them in
          one session. Each player is still registered as its own on-chain
          transaction — you will be asked to sign once per player.
        </p>
      </div>

      {/* ── File upload ──────────────────────────────────────────────────── */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 space-y-4">
        <div>
          <label
            htmlFor="bulk-import-file"
            className="block text-sm font-medium text-gray-300"
          >
            Player file (CSV or JSON)
          </label>
          <p id="bulk-import-hint" className="text-xs text-gray-400 mt-1">
            Required columns/fields: name, age, nationality, region, position.
            Optional: bio. One row/object per player. No highlight reel upload
            here — add those later per-player.
          </p>
        </div>
        <input
          ref={fileInputRef}
          id="bulk-import-file"
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={handleFileChange}
          disabled={phase === 'submitting'}
          aria-describedby={
            [fileError ? 'bulk-import-file-error' : null, 'bulk-import-hint']
              .filter(Boolean)
              .join(' ') || undefined
          }
          aria-invalid={fileError ? true : undefined}
          className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-green transition file:mr-4 file:py-1 file:px-4 file:rounded-lg file:border-0 file:bg-brand-green file:text-black file:font-medium hover:file:opacity-90 disabled:opacity-50"
        />
        {fileError && (
          <p
            id="bulk-import-file-error"
            role="alert"
            className="text-sm text-red-500"
          >
            {fileError}
          </p>
        )}
        {fileName && !fileError && (
          <p className="text-sm text-gray-400">Loaded: {fileName}</p>
        )}
      </section>

      {/* ── Staged preview / progress table ─────────────────────────────── */}
      {rows.length > 0 && (
        <section className="bg-brand-card border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">
              {phase === 'preview' ? 'Preview' : 'Import Progress'}
            </h2>
            <p className="text-sm text-gray-400">
              {validRows.length} valid · {invalidRows.length} invalid ·{' '}
              {rows.length} total
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <caption className="sr-only">
                Bulk player import preview and status
              </caption>
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Row
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Name
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Age
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Nationality
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Region
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Position
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Status
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
                    <td className="py-2 pr-4 text-white">
                      {row.data.name || '—'}
                    </td>
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
                                {err.field}: {err.message}
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

          {formError && (
            <p role="alert" className="text-sm text-red-500">
              {formError}
            </p>
          )}

          {phase === 'done' && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-md border border-gray-700 bg-gray-900/50 p-3 text-sm text-gray-200"
            >
              Import complete: {succeededCount} registered, {failedCount}{' '}
              failed, {invalidRows.length} skipped (invalid).
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {(phase === 'preview' || phase === 'submitting') && (
              <Button
                type="button"
                onClick={handleImport}
                isLoading={phase === 'submitting'}
                disabled={
                  phase === 'submitting' ||
                  validRows.length === 0 ||
                  isPaused ||
                  !publicKey
                }
                title={
                  isPaused
                    ? 'Contract is currently paused'
                    : !publicKey
                      ? 'Connect a wallet to import players'
                      : undefined
                }
              >
                {phase === 'submitting'
                  ? 'Importing…'
                  : `Import ${validRows.length} valid player${validRows.length === 1 ? '' : 's'}`}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={resetAll}
              disabled={phase === 'submitting'}
            >
              {phase === 'done'
                ? 'Import another batch'
                : 'Choose another file'}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
