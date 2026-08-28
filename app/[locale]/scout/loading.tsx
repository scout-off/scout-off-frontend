'use client';
import { useTranslations } from 'next-intl';

export default function ScoutLoading() {
  const t = useTranslations();

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('common.loading')}
      className="max-w-3xl mx-auto flex flex-col gap-4"
    >
      <div className="h-9 w-56 rounded bg-gray-700 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-col gap-4 animate-pulse"
          >
            <div className="w-16 h-16 rounded-full bg-gray-700" />
            <div className="flex flex-col gap-2">
              <div className="h-4 w-32 rounded bg-gray-700" />
              <div className="h-3 w-24 rounded bg-gray-700" />
            </div>
            <div className="h-2 w-full rounded bg-gray-700" />
          </div>
        ))}
      </div>
    </div>
  );
}
