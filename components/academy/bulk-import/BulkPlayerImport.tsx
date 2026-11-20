'use client';

import { useTranslations } from 'next-intl';
import UploadStep from './UploadStep';
import ReviewStep from './ReviewStep';
import ImportProgress from './ImportProgress';
import ImportSummary from './ImportSummary';
import { useBulkImport } from './useBulkImport';

/**
 * Bulk player import container: upload → review (parsed rows, resume banner)
 * → sequential import with pause / resume / cancel → summary. All state lives
 * in useBulkImport; the step components are presentational.
 */
export default function BulkPlayerImport() {
  const t = useTranslations('academy.bulkImport');
  const {
    state,
    publicKey,
    isPaused,
    fileInputRef,
    validRows,
    invalidRows,
    succeededCount,
    failedCount,
    handleFileChange,
    handleImport,
    handlePause,
    handleResume,
    handleCancel,
    handleReset,
  } = useBulkImport();
  const { phase, rows, formError } = state;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('intro')}</p>
      </div>

      <UploadStep
        inputRef={fileInputRef}
        fileName={state.fileName}
        fileError={state.fileError}
        disabled={phase === 'submitting'}
        onFileChange={handleFileChange}
      />

      {rows.length > 0 && (
        <section className="bg-brand-card border border-gray-800 rounded-xl p-6 space-y-4">
          <ReviewStep
            phase={phase}
            rows={rows}
            submissions={state.submissions}
            validCount={validRows.length}
            invalidCount={invalidRows.length}
            resumedSessionInfo={state.resumedSessionInfo}
          />

          {formError && (
            <p role="alert" className="text-sm text-red-500">
              {formError}
            </p>
          )}

          {phase === 'done' && (
            <ImportSummary
              succeeded={succeededCount}
              failed={failedCount}
              invalid={invalidRows.length}
            />
          )}

          <ImportProgress
            phase={phase}
            isPausedBatch={state.isPausedBatch}
            validCount={validRows.length}
            doneCount={succeededCount + failedCount}
            hasWallet={!!publicKey}
            contractPaused={isPaused}
            onImport={handleImport}
            onPause={handlePause}
            onResume={handleResume}
            onCancel={handleCancel}
            onReset={handleReset}
          />
        </section>
      )}
    </div>
  );
}
