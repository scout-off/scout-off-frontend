import { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';

interface LocaleLayoutProps {
  children: ReactNode;
  params: {
    locale: string;
  };
}

const locales = ['en', 'fr', 'sw'];

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default function LocaleLayout({
  children,
  params: { locale },
}: LocaleLayoutProps) {
  setRequestLocale(locale);

  return <>{children}</>;
}
