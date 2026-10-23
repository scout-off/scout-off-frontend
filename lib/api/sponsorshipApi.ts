/**
 * Sponsorship waitlist API helpers (issue #1516).
 *
 * Backed by the server/ Express API (SQLite), not the local filesystem
 * pattern used by the referral store.
 */
import { backendClient as api } from './playersApi';

export type InterestType = 'fan' | 'investor' | 'sponsor';

export const joinSponsorshipWaitlist = (
  email: string,
  interestType: InterestType = 'fan',
  turnstileToken?: string,
): Promise<{ message: string }> =>
  api
    .post('/sponsorship/waitlist', { email, interestType, turnstileToken })
    .then((r) => r.data);
