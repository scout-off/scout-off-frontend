/**
 * Explanations shown on the destination page when useRequireWallet or
 * useRequireSubscription redirect a user away from a protected route.
 * Passed via a `?reason=` query param so the message survives the
 * navigation reliably, instead of depending on a toast timed to a
 * page transition.
 */
export const REDIRECT_REASONS = {
  'wallet-required': 'You need to connect your wallet to view that page.',
  'subscription-expired':
    'Your subscription has expired — please renew to continue.',
} as const;

export type RedirectReason = keyof typeof REDIRECT_REASONS;

export function isRedirectReason(
  value: string | string[] | null | undefined,
): value is RedirectReason {
  return typeof value === 'string' && value in REDIRECT_REASONS;
}

/**
 * Validate a `returnTo` path from the query string (#1696). Only same-origin,
 * root-relative paths are accepted, to prevent open redirects. Returns the
 * normalized path (pathname + search + hash) or null when unsafe.
 */
export function sanitizeReturnTo(
  value: string | string[] | null | undefined,
  origin: string,
): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/[\u0000-\u001f\\]/.test(value)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value.slice(1))) return null;
  try {
    const base = new URL(origin);
    const url = new URL(value, base);
    if (url.origin !== base.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
