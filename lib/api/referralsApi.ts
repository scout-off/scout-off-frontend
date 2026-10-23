/**
 * Referral-domain API helpers (issue #1516).
 *
 * Backed by the Node.js off-chain API (server/) — a real SQLite-backed
 * service, not a local Next.js route reading/writing a JSON file.
 */
import { backendClient as api } from './playersApi';
import { fetchWithRetry } from '../fetchWithRetry';
import type { ReferralCode, ReferralStats, ReferralOverview } from '@/types';

export const generateReferralCode = (
  scoutWallet: string,
  turnstileToken?: string,
): Promise<ReferralCode> =>
  api
    .post('/referrals/generate', { scoutWallet, turnstileToken })
    .then((r) => r.data);

export const getReferralStats = (scoutWallet: string): Promise<ReferralStats> =>
  api
    .get(`/referrals/count/${encodeURIComponent(scoutWallet)}`)
    .then((r) => r.data);

export const listReferralCodes = (
  scoutWallet: string,
): Promise<ReferralCode[]> =>
  api
    .get(`/referrals/scout/${encodeURIComponent(scoutWallet)}`)
    .then((r) => r.data);

export const fetchAllReferralCodes = (): Promise<ReferralCode[]> =>
  api.get('/referrals/all').then((r) => r.data);

export const getReferralOverview = async (): Promise<ReferralOverview> => {
  const res = await fetchWithRetry('/api/admin/referrals');
  if (!res.ok) throw new Error('Failed to fetch referral overview');
  return res.json();
};
