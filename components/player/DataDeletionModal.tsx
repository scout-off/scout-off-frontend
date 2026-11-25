'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ShieldAlert,
  Database,
  CheckCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { purgeAllContactDetails } from '@/lib/contactDetailsCache';
import { deleteOnboardingSubmission } from '@/lib/onboardingSyncStore';

interface DataDeletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Connected wallet, used to purge its browser-only onboarding queue. */
  wallet?: string | null;
}

type RequestStatus =
  | 'idle'
  | 'confirming'
  | 'submitting'
  | 'pending'
  | 'success'
  | 'error';

interface DeletionStepStatus {
  name: string;
  status: 'pending' | 'completed' | 'failed';
  attempts?: number;
  lastError?: string | null;
}

interface DeletionRequestStatus {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  steps: DeletionStepStatus[];
  completedAt?: string | null;
  deadlineAt?: string | null;
}

const POLL_INTERVAL_MS = 4000;

export default function DataDeletionModal({
  isOpen,
  onClose,
  wallet,
}: DataDeletionModalProps) {
  const t = useTranslations('dataDeletion');
  const { show } = useToast();
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] =
    useState<DeletionRequestStatus | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/data-deletion/request/${id}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('Status fetch failed');
        const body = (await res.json()) as DeletionRequestStatus;
        setRequestStatus(body);

        if (body.status === 'completed') {
          setStatus('success');
          show({
            message: t('success_toast'),
            variant: 'success',
            duration: 6000,
          });
          return;
        }
        if (body.status === 'failed') {
          setStatus('error');
          return;
        }
        // Still pending — keep polling until the cron job finishes.
        pollTimer.current = setTimeout(() => {
          void pollStatus(id);
        }, POLL_INTERVAL_MS);
      } catch {
        // Transient network error — retry on the next tick.
        pollTimer.current = setTimeout(() => {
          void pollStatus(id);
        }, POLL_INTERVAL_MS);
      }
    },
    [show, t],
  );

  useEffect(() => {
    if (!isOpen) {
      stopPolling();
    }
    return stopPolling;
  }, [isOpen, stopPolling]);

  const handleRequestDeletion = async () => {
    setStatus('submitting');
    try {
      const res = await fetch('/api/data-deletion/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Request failed');
      }

      const body = (await res.json().catch(() => ({}))) as {
        requestId?: string;
      };

      // The server-side cascade (app/api/data-deletion/request) purges
      // every store it can reach, but unlocked contact details live only in
      // this tab's in-memory SWR cache (see lib/contactDetailsCache.ts) —
      // no server route can see or clear them. Purge that cache explicitly
      // here so a confirmed deletion request also covers it, same as the
      // existing wallet-disconnect wipe.
      await purgeAllContactDetails();
      // Same for a pending offline onboarding submission (browser IndexedDB).
      if (wallet) await deleteOnboardingSubmission(wallet);

      if (body.requestId) {
        setRequestId(body.requestId);
        setStatus('pending');
        void pollStatus(body.requestId);
      } else {
        // Fallback for older servers that still process synchronously.
        setStatus('success');
        show({
          message: t('success_toast'),
          variant: 'success',
          duration: 6000,
        });
      }
    } catch (err: unknown) {
      setStatus('error');
      show({
        message: err instanceof Error ? err.message : t('error_toast'),
        variant: 'error',
        duration: 6000,
      });
    }
  };

  const handleClose = () => {
    stopPolling();
    setStatus('idle');
    setRequestId(null);
    setRequestStatus(null);
    onClose();
  };

  const completedSteps =
    requestStatus?.steps.filter((s) => s.status === 'completed').length ?? 0;
  const totalSteps = requestStatus?.steps.length ?? 0;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('modal_title')}>
      <div className="flex flex-col gap-5">
        {/* On-chain data (immutable) */}
        <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
          <ShieldAlert
            size={20}
            className="mt-0.5 shrink-0 text-yellow-500"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-yellow-500">
              {t('onchain_heading')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              {t('onchain_description')}
            </p>
          </div>
        </div>

        {/* Off-chain data (deletable) */}
        <div className="flex items-start gap-3 rounded-xl border border-brand-green/30 bg-brand-green/5 p-4">
          <Database
            size={20}
            className="mt-0.5 shrink-0 text-brand-green"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-brand-green">
              {t('offchain_heading')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              {t('offchain_description')}
            </p>
          </div>
        </div>

        {/* Status state */}
        {status === 'success' ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle
              size={36}
              className="text-brand-green"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-white">
              {t('success_title')}
            </p>
            <p className="text-xs text-gray-400">{t('success_message')}</p>
            <Button
              variant="secondary"
              onClick={handleClose}
              className="mt-1 w-full"
            >
              {t('done')}
            </Button>
          </div>
        ) : status === 'pending' ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <Loader2
                size={36}
                className="animate-spin text-brand-green"
                aria-hidden="true"
              />
              <p className="text-sm font-semibold text-white">
                {t('pending_title')}
              </p>
              <p className="text-xs text-gray-400">{t('pending_message')}</p>
              {totalSteps > 0 && (
                <p className="text-xs text-gray-500">
                  {t('pending_progress', {
                    completed: completedSteps,
                    total: totalSteps,
                  })}
                </p>
              )}
            </div>
            {requestStatus && requestStatus.steps.length > 0 && (
              <ul className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/5 p-3">
                {requestStatus.steps.map((step) => (
                  <li
                    key={step.name}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate text-gray-300">{step.name}</span>
                    <span
                      className={
                        step.status === 'completed'
                          ? 'text-brand-green'
                          : step.status === 'failed'
                            ? 'text-red-400'
                            : 'text-gray-500'
                      }
                    >
                      {step.status === 'completed'
                        ? t('step_completed')
                        : step.status === 'failed'
                          ? t('step_failed')
                          : t('step_pending')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="secondary"
              onClick={handleClose}
              className="w-full"
            >
              {t('close')}
            </Button>
          </div>
        ) : status === 'confirming' ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={20}
                  className="mt-0.5 shrink-0 text-red-500"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-semibold text-red-500">
                    {t('confirm_title')}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-400">
                    {t('confirm_message')}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setStatus('idle')}
                className="flex-1"
              >
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={handleRequestDeletion}
                className="flex-1"
              >
                {t('confirm_button')}
              </Button>
            </div>
          </div>
        ) : status === 'submitting' ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Loader2
              size={36}
              className="animate-spin text-brand-green"
              aria-hidden="true"
            />
            <p className="text-sm text-gray-300">{t('submitting')}</p>
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-red-400 text-center">
              {t('error_message')}
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={handleClose}
                className="flex-1"
              >
                {t('close')}
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  if (requestId) {
                    setStatus('pending');
                    void pollStatus(requestId);
                  } else {
                    setStatus('confirming');
                  }
                }}
                className="flex-1"
              >
                {t('retry')}
              </Button>
            </div>
          </div>
        ) : (
          /* Idle state — initial view */
          <div className="flex flex-col gap-4">
            <Button
              variant="danger"
              onClick={() => setStatus('confirming')}
              className="w-full"
            >
              {t('request_button')}
            </Button>
            <p className="text-xs text-gray-500 text-center">
              {t('request_note')}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
