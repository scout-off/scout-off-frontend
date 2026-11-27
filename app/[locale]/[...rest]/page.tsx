import type { Locale } from 'next-intl';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

// Next.js only renders the segment-level `not-found.tsx` for explicit
// `notFound()` calls, not for unmatched sub-paths. This catch-all turns any
// unknown route under a valid locale (e.g. `/fr/does-not-exist`) into a
// `notFound()`, which renders the localized `app/[locale]/not-found.tsx`.
//
// It also owns the route's metadata: Next resolves a not-found's title from the
// matched leaf segment (this page), not from the `not-found.tsx` boundary, so
// returning the localized title here is what makes the browser show
// "Page introuvable — ScoutOff" instead of the layout's default title.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; rest: string[] }>;
}): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('not_found');
  return { title: t('title') };
}

export default async function CatchAllPage({
  params,
}: {
  params: Promise<{ locale: string; rest: string[] }>;
}) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  notFound();
}
