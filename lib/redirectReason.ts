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
