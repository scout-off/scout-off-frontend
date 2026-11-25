const { randomInt } = require('crypto');
const db = require('./db');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_BODY_LENGTH = 6;
const MAX_GENERATE_ATTEMPTS = 20;
const DEFAULT_MAX_UNREDEEMED_CODES_PER_WALLET = 10;

/**
 * Most unredeemed codes one scout wallet may hold (#1774). Set with
 * REFERRAL_MAX_UNREDEEMED; read on each call so tests and restarts pick it up.
 */
function maxUnredeemedCodesPerWallet() {
  const parsed = Number.parseInt(process.env.REFERRAL_MAX_UNREDEEMED ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UNREDEEMED_CODES_PER_WALLET;
}

/** Thrown when a wallet already holds the maximum number of unredeemed codes. */
class ReferralLimitError extends Error {
  constructor(limit) {
    super('Referral code limit reached');
    this.name = 'ReferralLimitError';
    this.code = 'REFERRAL_LIMIT_REACHED';
    this.limit = limit;
  }
}

/** Referral codes are upper case; accept any case and surrounding whitespace (#1777). */
function normalizeReferralCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

function randomCode() {
  let code = 'SCOUT-';
  for (let i = 0; i < CODE_BODY_LENGTH; i++) {
    // #1776: referral codes act as bearer tokens, so draw from a CSPRNG.
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

const insertCode = db.prepare(
  `INSERT INTO referral_codes (code, scout_wallet, created_at, used_by, used_at)
   VALUES (@code, @scoutWallet, @createdAt, NULL, NULL)`,
);
const findByCode = db.prepare(`SELECT * FROM referral_codes WHERE code = ?`);
const findByScout = db.prepare(
  `SELECT * FROM referral_codes WHERE scout_wallet = ? ORDER BY created_at DESC`,
);
const countUnredeemedByScout = db.prepare(
  `SELECT COUNT(*) AS count FROM referral_codes
   WHERE scout_wallet = ? AND used_by IS NULL`,
);
const countRedeemedByScout = db.prepare(
  `SELECT COUNT(*) AS count FROM referral_codes
   WHERE scout_wallet = ? AND used_by IS NOT NULL`,
);
const markRedeemed = db.prepare(
  `UPDATE referral_codes SET used_by = @usedBy, used_at = @usedAt
   WHERE code = @code AND used_by IS NULL`,
);

function toReferral(row) {
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
 *
 * #1774: refuses with ReferralLimitError once the wallet holds the maximum
 * number of unredeemed codes. The count and the insert run in one
 * transaction so concurrent calls cannot both slip past the cap.
 */
const generateCodeTx = db.transaction((scoutWallet) => {
  const limit = maxUnredeemedCodesPerWallet();
  if (countUnredeemedByScout.get(scoutWallet).count >= limit) {
    throw new ReferralLimitError(limit);
  }

  let code;
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
});

function generateCode(scoutWallet) {
  return generateCodeTx(scoutWallet);
}

function getCodesByScout(scoutWallet) {
  return findByScout.all(scoutWallet).map(toReferral);
}

function getReferralCount(scoutWallet) {
  return countRedeemedByScout.get(scoutWallet).count;
}

/** Every referral code across every scout wallet, for cross-wallet fraud analysis. */
function getAllCodes() {
  return allCodes.all().map(toReferral);
}

/** Redeems a code on behalf of `usedBy`; rejects self-redemption. */
function redeemCode(rawCode, usedBy) {
  const code = normalizeReferralCode(rawCode);
  if (!code) return false;
  const existing = findByCode.get(code);
  if (!existing || existing.used_by !== null) return false;
  if (existing.scout_wallet === usedBy) return false;

  const usedAt = Date.now();
  const result = markRedeemed.run({ code, usedBy, usedAt });
  return result.changes === 1;
}

const TOP_REFERRERS_LIMIT = 10;

const allCodes = db.prepare(`SELECT * FROM referral_codes`);

/** Platform-wide referral totals and the top referrers by successful referrals. */
function getReferralOverview() {
  const codes = allCodes.all().map(toReferral);

  const byScout = new Map();
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

module.exports = {
  ReferralLimitError,
  maxUnredeemedCodesPerWallet,
  normalizeReferralCode,
  generateCode,
  getCodesByScout,
  getReferralCount,
  getAllCodes,
  redeemCode,
  getReferralOverview,
};
