/**
 * Fraud / abuse detection API helpers (issue #1516).
 *
 * Same-origin fetch calls to the Next.js proxy routes — not the external
 * backend directly.
 */
import { fetchWithRetry } from '../fetchWithRetry';
import type { FraudFlag, FraudThrottle, FraudFlagDismissal } from '@/types';

/**
 * Checks issue #1174's admin-gated auto-throttle state for `wallet` via this
 * app's own /api/fraud/throttle-status (never the external referral/activity
 * backend `api` above — throttle state is local to this Next.js deployment).
 * Fails open (`false`) on any network/parse error, matching this repo's
 * existing precedent of never letting an auxiliary check block a core flow
 * outright on its own failure — a throttle is enforced when confirmed
 * throttled, not merely when the check itself couldn't be reached.
 */
export const checkFraudThrottle = async (wallet: string): Promise<boolean> => {
  try {
    const res = await fetch(
      `/api/fraud/throttle-status?wallet=${encodeURIComponent(wallet)}`,
    );
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.throttled);
  } catch {
    return false;
  }
};

export const REFERRAL_THROTTLE_MESSAGE =
  'This wallet is temporarily unable to redeem referral codes while under review. If you believe this is a mistake, please contact support.';

export const redeemReferralCode = async (
  code: string,
  usedBy: string,
): Promise<boolean> => {
  const { backendClient: api } = await import('./playersApi');
  if (await checkFraudThrottle(usedBy)) {
    return false;
  }
  return api
    .post('/referrals/redeem', { code, usedBy })
    .then(() => true)
    .catch(() => false);
};

export const fetchFraudFlags = async (): Promise<{
  flags: FraudFlag[];
  warnings: string[];
  evaluatedAt: number;
  eventsProcessed?: number;
  durationMs?: number;
}> => {
  const res = await fetchWithRetry('/api/admin/fraud-flags');
  if (!res.ok) throw new Error('Failed to fetch fraud flags');
  return res.json();
};

/**
 * Lightweight status of the most recently *persisted* fraud-flag
 * evaluation (issue #1007) — populated by either an admin panel load or
 * the scheduled cron trigger, whichever ran most recently. Used to render
 * a staleness indicator without paying the cost of a full evaluation.
 */
export const fetchFraudFlagsStatus = async (): Promise<{
  evaluatedAt: number | null;
  highSeverityCount: number;
  trigger: 'manual' | 'cron' | null;
  eventsProcessed?: number;
  durationMs?: number;
  lastLedger?: number;
}> => {
  const res = await fetchWithRetry('/api/admin/fraud-flags/status');
  if (!res.ok) throw new Error('Failed to fetch fraud flags status');
  return res.json();
};

/**
 * The admin-auditable trail for issue #1174's admin-gated auto-throttling —
 * full history (active and lifted), most recently placed first.
 */
export const fetchFraudThrottles = async (): Promise<{
  throttles: FraudThrottle[];
}> => {
  const res = await fetchWithRetry('/api/admin/fraud-flags/throttles');
  if (!res.ok) throw new Error('Failed to fetch fraud throttles');
  return res.json();
};

/**
 * The only way a throttle changes state — no automatic expiry exists
 * anywhere in this codebase, per docs/fraud-detection.md.
 *
 * Deliberately a bare `fetch`, not `fetchWithRetry`: a POST with no
 * idempotency key, so an automatic retry after a lost response risks a
 * confusing double-lift attempt.
 */
export const liftFraudThrottle = async (
  id: number,
  reason?: string,
): Promise<FraudThrottle> => {
  const res = await fetch(`/api/admin/fraud-flags/throttles/${id}/lift`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error('Failed to lift fraud throttle');
  return res.json();
};

/**
 * Persists an admin decision that `flag` is reviewed and not actually abuse
 * (issue #1171), so it stops re-surfacing on subsequent `fetchFraudFlags`
 * loads as long as the underlying evidence hasn't materially changed. See
 * lib/fraudFlagDismissalStore.ts and app/api/admin/fraud-flags/dismiss/route.ts.
 *
 * Deliberately a bare `fetch`, not `fetchWithRetry`: a POST with no
 * idempotency key, matching liftFraudThrottle's precedent above.
 */
export const dismissFraudFlag = async (
  flag: Pick<
    FraudFlag,
    'category' | 'heuristic' | 'severity' | 'wallets' | 'reason'
  >,
  note?: string,
): Promise<FraudFlagDismissal> => {
  const res = await fetch('/api/admin/fraud-flags/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flag, note }),
  });
  if (!res.ok) throw new Error('Failed to dismiss fraud flag');
  return res.json();
};
