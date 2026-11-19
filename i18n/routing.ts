import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'fr', 'sw', 'ar'],
  defaultLocale: 'en',
});
