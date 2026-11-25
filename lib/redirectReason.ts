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
 * Validates a `returnTo` query param so it can only point at a same-origin
 * path. Returns the safe path, or null for anything that could be used as an
 * open redirect (`//evil.com`, `/\evil.com`, `https://…`, `javascript:` …).
 */
export function getSafeReturnTo(
  value: string | string[] | null | undefined,
  origin: string,
): string | null {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || /[\u0000-\u001f]/.test(value)) {
    return null;
  }
  try {
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
