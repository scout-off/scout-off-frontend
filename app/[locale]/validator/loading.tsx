'use client';
import { useTranslations } from 'next-intl';

export default function ValidatorLoading() {
  const t = useTranslations();

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('common.loading')}
      className="max-w-3xl mx-auto flex flex-col gap-8"
    >
      <div className="h-9 w-56 rounded bg-gray-700 animate-pulse" />

      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <div className="h-6 w-32 rounded bg-gray-700 animate-pulse" />
        <div className="h-10 w-full rounded bg-gray-700 animate-pulse" />
      </section>

      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <div className="h-6 w-40 rounded bg-gray-700 animate-pulse" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-lg bg-gray-800/50 animate-pulse"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
