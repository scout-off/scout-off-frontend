'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import type { Phase } from './types';

export interface ImportProgressProps {
  phase: Phase;
  isPausedBatch: boolean;
  validCount: number;
  doneCount: number;
  hasWallet: boolean;
  contractPaused: boolean;
  onImport: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onReset: () => void;
}

/** Import / pause / resume / cancel controls with the running progress count. */
export default function ImportProgress({
  phase,
  isPausedBatch,
  validCount,
  doneCount,
  hasWallet,
  contractPaused,
  onImport,
  onPause,
  onResume,
  onCancel,
  onReset,
}: ImportProgressProps) {
  const t = useTranslations('academy.bulkImport');
  const tContractStatus = useTranslations('contract_status');
  const submitting = phase === 'submitting';

  return (
    <div className="flex flex-wrap gap-3">
      {(phase === 'preview' || submitting) && (
        <>
          {submitting && !isPausedBatch && (
            <Button type="button" variant="secondary" onClick={onPause}>
              {t('pause')}
            </Button>
          )}
          {submitting && isPausedBatch && (
            <Button type="button" onClick={onResume}>
              {t('resume')}
            </Button>
          )}
          {submitting && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              {t('cancel')}
            </Button>
          )}
          <Button
            type="button"
            onClick={onImport}
            isLoading={submitting && !isPausedBatch}
            disabled={submitting || validCount === 0 || !hasWallet}
            disabledReason={
              contractPaused ? tContractStatus('paused_hint') : undefined
            }
            title={
              !contractPaused && !hasWallet
                ? t('connectWalletTitle')
                : undefined
            }
          >
            {submitting
              ? isPausedBatch
                ? t('paused')
                : t('importing', { done: doneCount, total: validCount })
              : t('importButton', { count: validCount })}
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="secondary"
        onClick={onReset}
        disabled={submitting}
      >
        {phase === 'done' ? t('importAnother') : t('chooseAnother')}
      </Button>
    </div>
  );
}
