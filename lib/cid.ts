/**
 * Strict IPFS CID format check, used before a CID is interpolated into an
 * upstream gateway URL (see app/api/media/[cid]/route.ts).
 *
 * Accepts CIDv0 (base58btc, `Qm` + 44 chars) and CIDv1 in the common
 * multibase encodings: base32 (`b...`, or upper-case `B...`), base36
 * (`k...`, or upper-case `K...`, common for IPNS keys and gateway subdomains)
 * and base58btc (`z...`). Anything containing `/`, `?`, `#`, `%` or `.` is
 * rejected by the alphabets, so accepting base36 and upper-case base32 does
 * not weaken the gateway-URL check.
 *
 * Security: base32 and base36 are case-insensitive, so `B…` and `b…` name the
 * same media. Use normalizeCid() before any denylist lookup or cache key so
 * an upper-case variant of a denylisted CID cannot bypass moderation. Base58
 * (`Qm…`, `z…`) is case-sensitive and is never case-folded.
 */
const MAX_CID_LENGTH = 100;
const CID_V0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1_BASE32 = /^b[a-z2-7]{58,}$/;
const CID_V1_BASE36 = /^k[a-z0-9]{48,}$/;
const CID_V1_BASE58 = /^z[1-9A-HJ-NP-Za-km-z]{46,}$/;
/** Upper-case base32/base36 multibase prefix, optionally followed by a file extension. */
const UPPER_CASE_MULTIBASE = /^([BK][A-Z0-9]+)(\.[A-Za-z0-9]{1,8})?$/;

/**
 * Folds upper-case base32 (`B…`) and base36 (`K…`) CIDs to their canonical
 * lower-case form, keeping any file extension. Other values are returned
 * unchanged.
 */
export function normalizeCid(cid: string): string {
  const match = UPPER_CASE_MULTIBASE.exec(cid);
  return match ? match[1].toLowerCase() + (match[2] ?? '') : cid;
}

export function isValidCid(cid: unknown): cid is string {
  if (typeof cid !== 'string' || cid.length > MAX_CID_LENGTH) return false;
  const normalized = normalizeCid(cid);
  return (
    CID_V0.test(normalized) ||
    CID_V1_BASE32.test(normalized) ||
    CID_V1_BASE36.test(normalized) ||
    CID_V1_BASE58.test(normalized)
  );
}
