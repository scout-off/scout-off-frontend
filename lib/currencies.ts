/**
 * Hardcoded subset of ISO 4217 codes the platform supports for display.
 * Lives outside the 'use client' hook so server routes can validate against it.
 */
export const SUPPORTED_CURRENCIES = [
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'NGN', label: 'Nigerian Naira (₦)' },
  { code: 'KES', label: 'Kenyan Shilling (KSh)' },
  { code: 'ZAR', label: 'South African Rand (R)' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
  { code: 'CAD', label: 'Canadian Dollar (CA$)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
  { code: 'BRL', label: 'Brazilian Real (R$)' },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]['code'];

export const SUPPORTED_CURRENCY_CODES: readonly CurrencyCode[] =
  SUPPORTED_CURRENCIES.map((c) => c.code);

/**
 * Localized currency label, e.g. "US Dollar ($)" in `en` or
 * "dollar des États-Unis ($US)" in `fr`, built from ICU data via
 * `Intl.DisplayNames` and `Intl.NumberFormat`. Falls back to the English
 * label (or the bare code) when the locale or ICU data is unavailable.
 */
export function getCurrencyLabel(code: CurrencyCode, locale: string): string {
  const fallback =
    SUPPORTED_CURRENCIES.find((c) => c.code === code)?.label ?? code;
  try {
    const name = new Intl.DisplayNames([locale], { type: 'currency' }).of(code);
    if (!name || name === code) return fallback;
    const symbol = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value;
    return symbol && symbol !== code ? `${name} (${symbol})` : name;
  } catch {
    return fallback;
  }
}
