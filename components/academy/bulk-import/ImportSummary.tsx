'use client';

import { useTranslations } from 'next-intl';

export interface ImportSummaryProps {
  succeeded: number;
  failed: number;
  invalid: number;
}

export default function ImportSummary({
  succeeded,
  failed,
  invalid,
}: ImportSummaryProps) {
  const t = useTranslations('academy.bulkImport');

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-gray-700 bg-gray-900/50 p-3 text-sm text-gray-200"
    >
      {t('done', { succeeded, failed, invalid })}
    </div>
  );
}
