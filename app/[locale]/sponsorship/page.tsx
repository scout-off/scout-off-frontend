'use client';
import { useTranslations } from 'next-intl';
import { Coins } from 'lucide-react';

export default function SponsorshipPage() {
  const t = useTranslations('sponsorship');

  return (
    <div className="flex flex-col gap-12 pb-20">
      <section
        className="relative flex flex-col items-center text-center gap-6 py-24 px-4 overflow-hidden rounded-2xl"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,200,83,0.12) 0%, transparent 70%), linear-gradient(180deg, #0d1526 0%, #0A0F1E 100%)',
        }}
      >
        <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-brand-green border border-brand-green/30 bg-brand-green/10 px-4 py-1.5 rounded-full">
          <Coins size={12} />
          {t('badge')}
        </span>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight max-w-3xl">
          {t('title')}
        </h1>

        <p className="text-gray-400 max-w-xl text-base sm:text-lg leading-relaxed">
          {t('description')}
        </p>
      </section>

      <section className="px-4 max-w-2xl mx-auto text-center flex flex-col gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-white">
          {t('howItWorksTitle')}
        </h2>
        <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
          {t('howItWorksDescription')}
        </p>
        <p className="text-gray-500 text-xs">{t('notice')}</p>
      </section>
    </div>
  );
}
