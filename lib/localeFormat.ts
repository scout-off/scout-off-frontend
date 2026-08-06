/**
 * Locale-aware number and date formatting, using Intl.NumberFormat /
 * Intl.DateTimeFormat instead of plain string interpolation.
 *
 * Not yet wired into existing components - callers currently doing manual
 * string formatting for fees, counts, and dates (milestone timestamps,
 * subscription expiry) can switch to these helpers to get correct
 * en/fr/sw output instead of English-style formatting everywhere.
 */

import type { Locale } from './locales';

// BCP 47 tags for next-intl's supported locales.
const INTL_LOCALE_TAG: Record<Locale, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  sw: 'sw-KE',
};

function toIntlLocale(locale: Locale): string {
  return INTL_LOCALE_TAG[locale] ?? 'en-US';
}

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(toIntlLocale(locale), options).format(value);
}

export function formatXlmAmount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(toIntlLocale(locale), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 7,
  }).format(value);
}

export function formatDate(
  value: Date | number,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: 'medium',
    ...options,
  }).format(value);
}

export function formatDateTime(value: Date | number, locale: Locale): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
