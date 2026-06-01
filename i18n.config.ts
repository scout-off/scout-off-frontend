import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ locale }) => {
  try {
    const messages = (await import(`./messages/${locale}.json`)).default;
    return {
      messages,
      timeZone: 'UTC',
      now: new Date(),
    };
  } catch (error) {
    console.error(`Failed to load messages for locale ${locale}:`, error);
    // Fallback to English if locale doesn't exist
    const fallbackMessages = (await import(`./messages/en.json`)).default;
    return {
      messages: fallbackMessages,
      timeZone: 'UTC',
      now: new Date(),
    };
  }
});
