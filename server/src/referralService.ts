import db from './db';
import type { ReferralCode, ReferralOverview, TopReferrer } from './types/api';

interface ReferralRow {
  code: string;
  scout_wallet: string;
  created_at: number;
  used_by: string | null;
  used_at: number | null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_BODY_LENGTH = 6;
const MAX_GENERATE_ATTEMPTS = 20;

function randomCode() {
  let code = 'SCOUT-';
  for (let i = 0; i < CODE_BODY_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

const insertCode = db.prepare(
  `INSERT INTO referral_codes (code, scout_wallet, created_at, used_by, used_at)
   VALUES (@code, @scoutWallet, @createdAt, NULL, NULL)`,
);
const findByCode = db.prepare<[string], ReferralRow>(
  `SELECT * FROM referral_codes WHERE code = ?`,
);
const findByScout = db.prepare<[string], ReferralRow>(
  `SELECT * FROM referral_codes WHERE scout_wallet = ? ORDER BY created_at DESC`,
);
const countRedeemedByScout = db.prepare<[string], { count: number }>(
  `SELECT COUNT(*) AS count FROM referral_codes
   WHERE scout_wallet = ? AND used_by IS NOT NULL`,
);
const markRedeemed = db.prepare(
  `UPDATE referral_codes SET used_by = @usedBy, used_at = @usedAt
   WHERE code = @code AND used_by IS NULL`,
);

function toReferral(row: ReferralRow): ReferralCode {
  return {
    code: row.code,
    scoutWallet: row.scout_wallet,
    createdAt: row.created_at,
    usedBy: row.used_by,
    usedAt: row.used_at,
  };
}

/**
 * Generates a unique referral code for a scout, retrying on the rare
 * collision. Mirrors the collision-retry loop from the file-based
 * implementation this service replaces (lib/referralStore.ts).
 */
export function generateCode(scoutWallet: string): ReferralCode {
  let code: string | undefined;
  for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
    code = randomCode();
    if (!findByCode.get(code)) break;
    code = undefined;
  }
  if (!code) {
    throw new Error('Failed to generate a unique referral code');
  }

  const createdAt = Date.now();
  insertCode.run({ code, scoutWallet, createdAt });
  return { code, scoutWallet, createdAt, usedBy: null, usedAt: null };
}

export function getCodesByScout(scoutWallet: string): ReferralCode[] {
  return findByScout.all(scoutWallet).map(toReferral);
}

export function getReferralCount(scoutWallet: string): number {
  return countRedeemedByScout.get(scoutWallet)?.count ?? 0;
}

/** Every referral code across every scout wallet, for cross-wallet fraud analysis. */
export function getAllCodes(): ReferralCode[] {
  return allCodes.all().map(toReferral);
}

/** Redeems a code on behalf of `usedBy`; rejects self-redemption. */
export function redeemCode(code: string, usedBy: string): boolean {
  const existing = findByCode.get(code);
  if (!existing || existing.used_by !== null) return false;
  if (existing.scout_wallet === usedBy) return false;

  const usedAt = Date.now();
  const result = markRedeemed.run({ code, usedBy, usedAt });
  return result.changes === 1;
}

const TOP_REFERRERS_LIMIT = 10;

const allCodes = db.prepare<[], ReferralRow>(`SELECT * FROM referral_codes`);

/** Platform-wide referral totals and the top referrers by successful referrals. */
export function getReferralOverview(): ReferralOverview {
  const codes = allCodes.all().map(toReferral);

  const byScout = new Map<string, Omit<TopReferrer, 'scoutWallet'>>();
  for (const c of codes) {
    const entry = byScout.get(c.scoutWallet) ?? {
      totalCodes: 0,
      successfulReferrals: 0,
    };
    entry.totalCodes += 1;
    if (c.usedBy !== null) entry.successfulReferrals += 1;
    byScout.set(c.scoutWallet, entry);
  }

  const topReferrers = Array.from(byScout.entries())
    .map(([scoutWallet, stats]) => ({ scoutWallet, ...stats }))
    .sort(
      (a, b) =>
        b.successfulReferrals - a.successfulReferrals ||
        b.totalCodes - a.totalCodes,
    )
    .slice(0, TOP_REFERRERS_LIMIT);

  return {
    totalCodes: codes.length,
    totalSuccessfulReferrals: codes.filter((c) => c.usedBy !== null).length,
    topReferrers,
  };
}
