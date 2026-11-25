import type { Locale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

const locales: Locale[] = ['en', 'fr', 'sw'];
const defaultLocale: Locale = 'en';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  // Fallback to default if undefined or unsupported
  let locale: Locale = locales.includes(requested as Locale)
    ? (requested as Locale)
    : defaultLocale;

  let messages: Record<string, unknown>;
  try {
    messages = (await import(`./messages/${locale}.json`)).default;
  } catch {
    // Fallback to English if locale messages file is missing
    messages = (await import(`./messages/en.json`)).default;
    locale = defaultLocale;
  }

  return {
    locale,
    messages,
    now: new Date(),
  };
});
