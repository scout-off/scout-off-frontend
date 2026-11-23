import { track, computeRoute } from '@vercel/analytics';
import type { Metric } from 'web-vitals';

// CLS is a unitless score (typically well under 1); scale it up so it reads
// as a meaningful integer alongside the millisecond-based metrics rather
// than getting truncated to 0 by Math.round.
const CLS_SCALE_FACTOR = 1000;

/**
 * Sends a single Core Web Vitals measurement to the analytics pipeline.
 *
 * The pathname is reduced to its route pattern (e.g. `/en/player/GABC...`
 * -> `/[locale]/player/[id]`) via `computeRoute` so dynamic segments —
 * which can be Stellar wallet addresses — never leave the browser.
 */
export function reportWebVital(
  metric: Metric,
  pathname: string | null,
  params: Record<string, string | string[]> | null,
): void {
  const route = computeRoute(pathname, params) ?? pathname ?? 'unknown';

  track(`Web Vitals: ${metric.name}`, {
    value: Math.round(
      metric.name === 'CLS' ? metric.value * CLS_SCALE_FACTOR : metric.value,
    ),
    rating: metric.rating,
    route,
  });
}
