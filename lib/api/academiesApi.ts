/**
 * Academies API helpers (issue #1516, issue #663).
 *
 * Off-chain grouping of validator wallets under one institutional identity.
 * Admin-write endpoints go through the session-cookie-gated Next.js proxy
 * (app/api/admin/academies/**), matching the referrals admin pattern.
 * The wallet-lookup read is public and unauthenticated, hitting the backend
 * directly (matching fetchValidatorMilestoneCount).
 */
import { backendClient as api } from './playersApi';
import { fetchWithRetry } from '../fetchWithRetry';
import type { Academy, AcademyMilestoneRollup, MilestoneEndorsement } from '@/types';

async function parseErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export const fetchAcademies = async (): Promise<Academy[]> => {
  const res = await fetchWithRetry('/api/admin/academies');
  if (!res.ok)
    throw new Error(await parseErrorMessage(res, 'Failed to fetch academies'));
  return res.json();
};

/**
 * Scoped academy-owner admin role (issue #1173) — returns the academy/
 * academies the *connected* wallet is recorded as `ownerWallet` for, via
 * the session cookie (not the super-admin-gated full list above).
 */
export const fetchMyAcademies = async (): Promise<Academy[]> => {
  const res = await fetchWithRetry('/api/admin/academies/mine');
  if (!res.ok)
    throw new Error(
      await parseErrorMessage(res, 'Failed to fetch your academies'),
    );
  return res.json();
};

// createAcademy/addAcademyMember deliberately use a bare `fetch`, not
// `fetchWithRetry`: both are POSTs with no idempotency key, so an automatic
// retry after a lost response risks creating a duplicate academy or
// membership row.
export const createAcademy = async (
  name: string,
  ownerWallet: string,
): Promise<Academy> => {
  const res = await fetch('/api/admin/academies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ownerWallet }),
  });
  if (!res.ok)
    throw new Error(await parseErrorMessage(res, 'Failed to create academy'));
  return res.json();
};

export const addAcademyMember = async (
  academyId: string,
  wallet: string,
): Promise<Academy> => {
  const res = await fetch(
    `/api/admin/academies/${encodeURIComponent(academyId)}/members`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet }),
    },
  );
  if (!res.ok)
    throw new Error(
      await parseErrorMessage(res, 'Failed to add signer wallet'),
    );
  return res.json();
};

export const removeAcademyMember = async (
  academyId: string,
  wallet: string,
): Promise<void> => {
  const res = await fetchWithRetry(
    `/api/admin/academies/${encodeURIComponent(academyId)}/members/${encodeURIComponent(wallet)}`,
    { method: 'DELETE' },
  );
  if (!res.ok)
    throw new Error(
      await parseErrorMessage(res, 'Failed to remove signer wallet'),
    );
};

/**
 * Sets (or, with `quorum: null`, clears) an academy's milestone-approval
 * quorum (issue #1185).
 */
export const setAcademyQuorum = async (
  academyId: string,
  quorum: number | null,
): Promise<Academy> => {
  const res = await fetchWithRetry(
    `/api/admin/academies/${encodeURIComponent(academyId)}/quorum`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quorum }),
    },
  );
  if (!res.ok)
    throw new Error(await parseErrorMessage(res, 'Failed to set quorum'));
  return res.json();
};

/**
 * Looks up the academy a validator wallet is registered under, for
 * milestone-attribution display. Returns `null` when the wallet isn't part
 * of any academy or the lookup fails.
 */
export const fetchAcademyForWallet = async (
  wallet: string,
): Promise<Academy | null> => {
  try {
    const data = await api
      .get(`/academies/wallet/${encodeURIComponent(wallet)}`)
      .then((r) => r.data);
    return data ?? null;
  } catch {
    return null;
  }
};

/**
 * Off-chain academy-quorum endorsements for a milestone (issue #1185).
 */
export const fetchMilestoneEndorsements = async (
  playerId: string,
  milestoneId: string,
): Promise<MilestoneEndorsement[]> => {
  const res = await fetchWithRetry(
    `/api/milestones/${encodeURIComponent(playerId)}/${encodeURIComponent(
      milestoneId,
    )}/endorsements`,
  );
  if (!res.ok)
    throw new Error(
      await parseErrorMessage(res, 'Failed to fetch milestone endorsements'),
    );
  const data = await res.json();
  return data.endorsements ?? [];
};

/**
 * Records the caller's own off-chain endorsement of an already-on-chain-
 * approved milestone (issue #1185).
 */
export const endorseMilestone = async (
  playerId: string,
  milestoneId: string,
): Promise<void> => {
  const res = await fetchWithRetry(
    `/api/milestones/${encodeURIComponent(playerId)}/${encodeURIComponent(
      milestoneId,
    )}/endorsements`,
    { method: 'POST' },
  );
  if (!res.ok)
    throw new Error(
      await parseErrorMessage(res, 'Failed to endorse milestone'),
    );
};

/**
 * Academy-scoped milestone-approval rollup (issue #1172).
 */
export const fetchAcademyMilestoneRollup = async (
  rangeDays: number | 'all' = 30,
): Promise<AcademyMilestoneRollup> => {
  const res = await fetchWithRetry(
    `/api/admin/academies/rollup?rangeDays=${rangeDays}`,
  );
  if (!res.ok)
    throw new Error(
      await parseErrorMessage(res, 'Failed to fetch academy milestone rollup'),
    );
  return res.json();
};
