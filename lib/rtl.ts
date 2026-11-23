/**
 * RTL-readiness helper.
 *
 * The app doesn't ship an RTL locale yet, but this gives layout/components a
 * single place to determine text direction so a future Arabic/Hebrew locale
 * doesn't require touching every component individually.
 *
 * Wired into the `<html dir>` attribute in `app/layout.tsx` (the true root
 * layout, which resolves the active locale from the request path — see
 * `getLocale()` there). Nothing in the codebase uses Tailwind's `rtl:`
 * variant (which keys off an ancestor `[dir="rtl"]`) today, so setting
 * `dir` once on the root `<html>` element is sufficient; there is no need
 * to duplicate it on the inner `data-testid="locale-lang"` element in
 * `app/[locale]/layout.tsx`, which only exists to expose `lang` per the
 * nested route segment.
 */

// Locales this app might add that require right-to-left layout.
const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

export type TextDirection = 'ltr' | 'rtl';

export function getTextDirection(locale: string): TextDirection {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}
