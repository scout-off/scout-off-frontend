'use client';

import { useTranslations } from 'next-intl';
import { Clock, Wifi, RefreshCw, AlertTriangle, X, Trash2 } from 'lucide-react';
import type { FailedAction } from '@/lib/offlineQueue';

interface OfflineQueueBannerProps {
  /** Number of actions waiting to be processed. */
  pendingCount: number;
  /** Whether the queue is currently being processed. */
  isProcessing: boolean;
  /** Callback to manually retry processing. */
  onRetry: () => void;
  /** Actions that have permanently failed and need user attention. */
  failedActions?: FailedAction[];
  /** Callback to discard a single failed action by id. */
  onDiscardFailed?: (id: string) => void;
  /** Callback to discard all failed actions. */
  onDiscardAllFailed?: () => void;
}

/**
 * Banner that shows the user when there are queued actions waiting to be
 * submitted once connectivity is restored, and/or permanently-failed
 * actions that the user needs to explicitly discard.
 */
export default function OfflineQueueBanner({
  pendingCount,
  isProcessing,
  onRetry,
  failedActions = [],
  onDiscardFailed,
  onDiscardAllFailed,
}: OfflineQueueBannerProps) {
  const t = useTranslations('offline_queue');

  const hasPending = pendingCount > 0;
  const hasFailed = failedActions.length > 0;

  if (!hasPending && !hasFailed) return null;

  return (
    <div className="space-y-3">
      {/* ── Pending / processing banner ── */}
      {hasPending && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"
        >
          <div className="flex items-start gap-3">
            {isProcessing ? (
              <RefreshCw
                className="h-5 w-5 mt-0.5 animate-spin text-amber-400"
                aria-hidden="true"
              />
            ) : (
              <Clock
                className="h-5 w-5 mt-0.5 text-amber-400"
                aria-hidden="true"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-amber-200">
                {isProcessing
                  ? t('processing', { count: pendingCount })
                  : t('queued', { count: pendingCount })}
              </p>
              <p className="text-amber-300/80 mt-1">
                {isProcessing ? t('processing_desc') : t('queued_desc')}
              </p>
            </div>
            {!isProcessing && (
              <button
                type="button"
                onClick={onRetry}
                aria-label={t('retry_aria')}
                className="flex items-center gap-1.5 shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20 transition-colors"
              >
                <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
                {t('retry')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Dead-letter / failed actions banner ── */}
      {hasFailed && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="h-5 w-5 mt-0.5 shrink-0 text-red-400"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-medium text-red-200">
                  {t('failed', { count: failedActions.length })}
                </p>
                {onDiscardAllFailed && failedActions.length > 1 && (
                  <button
                    type="button"
                    onClick={onDiscardAllFailed}
                    className="flex items-center gap-1.5 shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('discard_all')}
                  </button>
                )}
              </div>
              <p className="text-red-300/80 mt-1">{t('failed_desc')}</p>

              {/* List of failed actions */}
              <ul className="mt-3 space-y-2" aria-label={t('failed')}>
                {failedActions.map((action) => (
                  <li
                    key={action.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-red-200">
                        {action.conflict
                          ? t('conflict_action_label', { type: action.type })
                          : t('failed_action_label', {
                              type: action.type,
                              retryCount: action.retryCount,
                            })}
                      </span>
                      <span className="block truncate text-xs text-red-400/80 mt-0.5">
                        {action.conflict
                          ? t('conflict_desc')
                          : action.lastError}
                      </span>
                    </div>
                    {onDiscardFailed && (
                      <button
                        type="button"
                        onClick={() => onDiscardFailed(action.id)}
                        aria-label={
                          action.conflict
                            ? t('conflict_discard_aria', { type: action.type })
                            : t('discard_aria', { type: action.type })
                        }
                        className="shrink-0 rounded-md border border-red-500/30 bg-red-500/10 p-1 text-red-300 hover:bg-red-500/20 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
