import { getRequestConfig } from 'next-intl/server';

const locales = ['en', 'fr', 'sw'];
const defaultLocale = 'en';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Fallback to default if undefined or unsupported
  if (!locale || !locales.includes(locale)) {
    locale = defaultLocale;
  }

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
    timeZone: 'UTC',
    now: new Date(),
  };
});
