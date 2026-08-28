'use client';
import { useTranslations } from 'next-intl';

export default function PlayerLoading() {
  const t = useTranslations();

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('common.loading')}
      className="max-w-2xl mx-auto flex flex-col gap-8"
    >
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex gap-6 items-start animate-pulse">
        <div className="w-20 h-20 rounded-full bg-gray-700 shrink-0" />
        <div className="flex-1 flex flex-col min-w-0 gap-2">
          <div className="h-8 w-48 max-w-full rounded bg-gray-700" />
          <div className="h-4 w-56 max-w-full rounded bg-gray-700" />
          <div className="h-2 w-full rounded-full bg-gray-700 mt-2" />
        </div>
      </div>

      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 animate-pulse">
        <div className="h-5 w-44 rounded bg-gray-700 mb-4" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="border-l-2 border-gray-700 pl-3 flex flex-col gap-1.5"
            >
              <div className="h-4 w-full max-w-sm rounded bg-gray-700" />
              <div className="h-3 w-40 rounded bg-gray-700" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
