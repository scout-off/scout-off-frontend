/**
 * Number of decimal places shown for user-facing XLM amounts.
 *
 * Stellar amounts carry up to 7 decimal places of native precision (1 XLM =
 * 10,000,000 stroops), but showing all 7 in a confirmation UI is noisy and
 * not meaningful right before a user signs a payment. 2 decimal places
 * matches how the platform's fee tiers are actually priced (whole and
 * half-XLM amounts) while still surfacing genuine fractional cents-of-XLM
 * precision if a contract-derived value ever isn't a round number.
 */
export const XLM_DISPLAY_DECIMALS = 2;

/**
 * Format a raw XLM amount for consistent, user-facing display.
 *
 * Used anywhere a fee or XLM amount is shown in a confirmation context
 * (pay-to-contact, subscription, admin fee views) so the same underlying
 * number always looks the same across the app, regardless of how many
 * decimal places the source value happened to carry.
 *
 * Accepts numbers or numeric strings; returns a fixed-point string with no
 * currency suffix — callers append "XLM" themselves.
 */
export function formatXlm(amount: number | string): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return (0).toFixed(XLM_DISPLAY_DECIMALS);

  // Plain toFixed() rounds based on the binary floating-point
  // approximation of `value`, which can push a boundary value (e.g.
  // 1.005) the wrong way (e.g. '1.00' instead of '1.01'). Rounding on a
  // scaled integer, with a small epsilon correction for the floating-point
  // representation error, rounds the way a human expects at these
  // boundaries.
  const factor = 10 ** XLM_DISPLAY_DECIMALS;
  const sign = value < 0 ? -1 : 1;
  const rounded =
    (sign * Math.round((Math.abs(value) + Number.EPSILON) * factor)) / factor;
  return rounded.toFixed(XLM_DISPLAY_DECIMALS);
}
