import crypto from 'crypto';
import { getMediaProxyUrl } from './mediaUrl';

/**
 * Server-only signed/expiring URL support for the IPFS media proxy.
 *
 * Never import this from a client component — it reads `MEDIA_URL_SIGNING_SECRET`
 * (a server secret) and uses Node's `crypto` module, neither of which belong in
 * a client bundle. Use lib/mediaUrl.ts's `getMediaProxyUrl` for ordinary,
 * unsigned display of public profile media; reach for `signMediaUrl` here only
 * when a route or server component needs a short-lived, non-guessable link
 * (e.g. a future "unlocked" media flow gated behind pay_to_contact).
 */

const SIGNING_SECRET = process.env.MEDIA_URL_SIGNING_SECRET;

/**
 * Whether this deployment has signed-URL enforcement configured. When false
 * (e.g. local dev with no secret set), the proxy route falls back to
 * referrer-based gating only — see app/api/media/[cid]/route.ts.
 */
export function isMediaSigningEnabled(): boolean {
  return Boolean(SIGNING_SECRET);
}

function sign(cid: string, exp: number): string {
  return crypto
    .createHmac('sha256', SIGNING_SECRET as string)
    .update(`${cid}:${exp}`)
    .digest('hex');
}

/**
 * Builds a signed, time-limited proxy URL for `cid`, valid for `ttlSeconds`
 * (default 1 hour). Requires `MEDIA_URL_SIGNING_SECRET` to be set.
 */
export function signMediaUrl(cid: string, ttlSeconds = 3600): string {
  if (!SIGNING_SECRET) {
    throw new Error(
      'signMediaUrl requires MEDIA_URL_SIGNING_SECRET to be set in the environment',
    );
  }
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = sign(cid, exp);
  return `${getMediaProxyUrl(cid)}?exp=${exp}&sig=${sig}`;
}

/**
 * Verifies a `sig`/`exp` query-param pair for `cid`. Returns `false` — never
 * throws — when signing isn't configured, params are missing/malformed, the
 * expiry has passed, or the signature doesn't match.
 */
export function verifyMediaUrlSignature(
  cid: string,
  exp: string | null,
  sig: string | null,
): boolean {
  if (!SIGNING_SECRET || !exp || !sig) return false;

  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = sign(cid, expNum);
  return timingSafeEqualStrings(expected, sig);
}

/**
 * Constant-time equality check for two equal-length-checked strings, to avoid
 * leaking signature bytes via early-exit string comparison timing. Operates
 * on plain strings (rather than `crypto.timingSafeEqual`'s Buffer/typed-array
 * inputs) to sidestep this project's `lib: ["dom", ...]` tsconfig, under
 * which Node's `Buffer` doesn't structurally satisfy DOM's `ArrayBufferView`.
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
