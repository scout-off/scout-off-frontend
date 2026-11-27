import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

// Note: a `not-found.tsx` component does not receive `params`, so it relies on
// the locale that `app/[locale]/layout.tsx` set via `setRequestLocale`.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('not_found');
  return { title: t('title') };
}

export default async function NotFound() {
  const t = await getTranslations('not_found');
  return (
    <section className="flex flex-col items-center text-center gap-6 py-24">
      <p className="text-6xl font-bold text-brand-green">404</p>
      <h1 className="text-3xl font-bold text-white">{t('heading')}</h1>
      <p className="text-gray-400 max-w-md text-lg">{t('body')}</p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/"
          className="bg-brand-green text-black font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition"
        >
          {t('backToHome')}
        </Link>
        <Link
          href="/scout"
          className="border border-brand-green text-brand-green px-6 py-3 rounded-xl hover:bg-brand-green hover:text-black transition"
        >
          {t('browsePlayers')}
        </Link>
      </div>
    </section>
  );
}
