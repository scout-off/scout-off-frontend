'use client';

import { useTranslations } from 'next-intl';
import { Clock, Wifi, RefreshCw } from 'lucide-react';

interface OfflineQueueBannerProps {
  /** Number of actions waiting to be processed. */
  pendingCount: number;
  /** Whether the queue is currently being processed. */
  isProcessing: boolean;
  /** Callback to manually retry processing. */
  onRetry: () => void;
}

/**
 * Banner that shows the user when there are queued actions waiting to be
 * submitted once connectivity is restored.
 */
export default function OfflineQueueBanner({
  pendingCount,
  isProcessing,
  onRetry,
}: OfflineQueueBannerProps) {
  const t = useTranslations('offline_queue');

  if (pendingCount === 0) return null;

  return (
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
          <Clock className="h-5 w-5 mt-0.5 text-amber-400" aria-hidden="true" />
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
  );
}
