/**
 * Referral code helpers shared by the scout UI and the API client.
 */

/** Error code the backend returns when a wallet holds too many unused codes (#1774). */
export const REFERRAL_LIMIT_REACHED = 'REFERRAL_LIMIT_REACHED';

/**
 * Referral codes are generated in upper case and meant to be typed or read
 * aloud, so trim and upper-case whatever the user (or `?ref=`) supplied (#1777).
 */
export function normalizeReferralCode(code: string | null | undefined): string {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}
