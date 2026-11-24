/**
 * Unified XLM amount formatter.
 *
 * Two precision modes:
 *   - 'display' (default): 2 decimal places with locale-aware grouping.
 *     Used in confirmation UIs (pay-to-contact, subscription, admin fees).
 *   - 'full': up to 7 decimal places for ledger-accurate views
 *     (balances, audit logs). Trailing zeros are stripped.
 *
 * All formatting is display-only. Never use these values in on-chain
 * transactions or as inputs to contract calls.
 *
 * stroops helper:
 *   fromStroops(n) converts a stroop integer to XLM (divides by 1e7).
 *   Use when a source value is documented as returning stroops (e.g. getPlatformFees()).
 */

export const XLM_DISPLAY_DECIMALS = 2;
export const XLM_MAX_DECIMALS = 7;
export const STROOPS_PER_XLM = 10_000_000;

export type XlmPrecision = 'display' | 'full';

/**
 * Convert stroops (integer, 1 XLM = 10,000,000 stroops) to XLM.
 * Use when a source value is documented as stroops.
 */
export function fromStroops(stroops: number | string): number {
  const value = typeof stroops === 'string' ? parseFloat(stroops) : stroops;
  if (!Number.isFinite(value)) return 0;
  return value / STROOPS_PER_XLM;
}

/**
 * Format a raw XLM amount for user-facing display.
 *
 * @param amount - XLM amount (not stroops). Use fromStroops() first if needed.
 * @param locale - BCP 47 locale string (e.g. 'en', 'fr', 'sw'). Defaults to 'en'.
 * @param options - precision mode and optionally override decimal places.
 */
export function formatXlm(
  amount: number | string,
  locale: string = 'en',
  options: { precision?: XlmPrecision } = {},
): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(value)) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: XLM_DISPLAY_DECIMALS,
      maximumFractionDigits: XLM_DISPLAY_DECIMALS,
      useGrouping: true,
    }).format(0);
  }

  const precision = options.precision ?? 'display';

  if (precision === 'display') {
    // 2 decimal places with locale grouping.
    // Apply boundary-rounding fix: use toFixed(2) first to get the correctly
    // rounded string, then parse back and format with Intl for locale grouping.
    const rounded = parseFloat(value.toFixed(XLM_DISPLAY_DECIMALS));
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: XLM_DISPLAY_DECIMALS,
      maximumFractionDigits: XLM_DISPLAY_DECIMALS,
      useGrouping: true,
    }).format(rounded);
  }

  // 'full': up to 7 decimals, trailing zeros stripped
  const rounded = parseFloat(value.toFixed(XLM_MAX_DECIMALS));
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: XLM_MAX_DECIMALS,
    useGrouping: true,
  }).format(rounded);
}
