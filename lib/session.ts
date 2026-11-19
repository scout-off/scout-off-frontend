import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual, randomUUID, createHash } from 'crypto';
import { SessionStore } from './sessionStore';
import { SESSION_COOKIE } from './sessionCookies';

// ─── Multi-key / key-rotation support (#1489, #1686) ─────────────────────────
//
// SESSION_SECRET_KEYS (comma-separated) is the preferred variable for
// production deployments that want zero-downtime rotation.  The *first* key
// in the list is the "current" key (used to sign every new token); remaining
// keys are accepted for verification only, letting tokens that were signed
// before the rotation remain valid until they naturally expire.
// SESSION_SECRET is still accepted as a single-key alias so existing
// deployments need no immediate migration.
//
// Each key's id (`kid`) is derived from the secret itself — see
// deriveKeyId below — so it is stable across reorderings of the list.  Before
// #1686 the id was the key's array position, which meant prepending a new
// secret silently re-pointed every existing token's `kid` at the wrong key.
//
// Rotation procedure:
//   1. Prepend the new secret to SESSION_SECRET_KEYS.
//   2. Keep the old secret(s) in the list so live tokens verify.
//   3. After max(ACCESS_TOKEN_TTL_SEC, REMEMBER_ME_REFRESH_TTL_SEC) has passed,
//      remove the old key from the list — tokens signed with it stop verifying.
//
// If neither variable is set the module throws at call time (not at import
// time) to avoid masking startup errors with a silent boot failure.

interface SigningKey {
  id: string;
  secret: string;
}

/**
 * Derives a stable, content-addressed key id from a secret (#1686).
 *
 * `base64url(sha256("scoutoff-session-kid:" + secret)).slice(0, 8)` is stable
 * across reorderings of SESSION_SECRET_KEYS and leaks nothing useful about the
 * secret (it is a truncated hash of a domain-separated input).
 */
function deriveKeyId(secret: string): string {
  return createHash('sha256')
    .update('scoutoff-session-kid:' + secret)
    .digest('base64url')
    .slice(0, 8);
}

/**
 * Returns all configured signing keys, newest-first.
 * Index 0 is the active key; the rest are accepted for verification only.
 */
function getSigningKeys(): SigningKey[] {
  const multi = process.env.SESSION_SECRET_KEYS;
  if (multi) {
    const keys = multi
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (keys.length === 0) {
      throw new Error('SESSION_SECRET_KEYS is set but contains no valid keys');
    }
    return keys.map((secret) => ({ id: deriveKeyId(secret), secret }));
  }

  const single = process.env.SESSION_SECRET;
  if (single) {
    return [{ id: deriveKeyId(single), secret: single }];
  }

  throw new Error('SESSION_SECRET (or SESSION_SECRET_KEYS) is not configured');
}

/** Returns the current (signing) key. */
function getCurrentKey(): SigningKey {
  return getSigningKeys()[0];
}

/** Returns the key with the given id, or undefined when none match. */
function findKeyById(id: string): SigningKey | undefined {
  return getSigningKeys().find((k) => k.id === id);
}

/**
 * True when `kid` looks like a legacy positional index ("0", "1", ...) that
 * was minted before #1686.  Only these are allowed to fall back to trying
 * every key; an unknown non-numeric kid is treated as a hard failure.
 */
function isLegacyPositionalKid(kid: string): boolean {
  return /^\d{1,3}$/.test(kid);
}

// See #778: the `session` cookie used to hold the caller's own plaintext
// public key with no signature and no server-side expiry — any HTTP client
// able to attach a `Cookie: session=<any-G-address>` header was
// authenticated as that address, without ever producing a signed SEP-10
// challenge transaction. Tokens below are HMAC-signed and time-bound so a
// cookie can only carry an identity this server actually issued.
//
// See #1179: a valid signature and an unexpired `exp` were still not
// enough to let the server invalidate one specific session before it
// naturally expired (e.g. "log out of all devices"). Every access/refresh
// token pair minted for a login now carries a shared `sid` claim, which
// lib/sessionStore.ts tracks server-side — getSessionWallet below checks
// that store, not just the token's signature, so revoking a `sid` rejects
// its cookie on the very next request.

/**
 * Resolves a token lifetime, letting an environment variable override the
 * built-in default — the same "env var wins" convention lib/sqliteDb.ts uses
 * for `SESSIONS_DB_PATH` (see #1299).
 *
 * The override exists so a test harness can shrink a lifetime to seconds
 * without waiting 20 real minutes for an access token to lapse
 * (e2e/session-lifecycle.spec.ts drives the silent-refresh path with
 * `ACCESS_TOKEN_TTL_SEC=10`). It is deliberately ignored in production:
 * deployments must not be able to accidentally mint five-second or
 * ten-year sessions from a stray env var, so `NODE_ENV=production` always
 * gets the compiled-in default. Unset, non-numeric, zero and negative
 * values likewise fall back to the default rather than failing closed at
 * import time (a bad env var must not take the whole auth surface down).
 */
function resolveTtlSec(envVar: string, defaultSec: number): number {
  if (process.env.NODE_ENV === 'production') return defaultSec;
  const raw = process.env[envVar];
  if (!raw) return defaultSec;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultSec;
  return Math.floor(parsed);
}

/** How long an access token (the `session` cookie) is valid for. */
export const ACCESS_TOKEN_TTL_SEC = resolveTtlSec(
  'ACCESS_TOKEN_TTL_SEC',
  20 * 60, // 20 minutes
);

/** Refresh token lifetime for a normal (non "remember me") sign-in. */
export const DEFAULT_REFRESH_TTL_SEC = resolveTtlSec(
  'DEFAULT_REFRESH_TTL_SEC',
  60 * 60 * 24, // 1 day
);

/** Refresh token lifetime when the caller opted into "remember me". */
export const REMEMBER_ME_REFRESH_TTL_SEC = resolveTtlSec(
  'REMEMBER_ME_REFRESH_TTL_SEC',
  60 * 60 * 24 * 30, // 30 days
);

type SessionTokenType = 'access' | 'refresh';

interface SessionTokenPayload {
  sub: string;
  typ: SessionTokenType;
  iat: number;
  exp: number;
  /**
   * Random per-token identifier. Guarantees each issued token is a distinct
   * string even when two tokens for the same subject/type/TTL are minted
   * within the same second (`iat` alone wouldn't distinguish them) — most
   * relevant for rotation, where the whole point is that the pre-rotation
   * token stops being the one currently in use.
   */
  jti: string;
  /** Only set on refresh tokens; carries the "remember me" TTL class through rotation. */
  remember?: boolean;
  /**
   * Session id (see lib/sessionStore.ts). Shared by an access token and its
   * paired refresh token, and carried forward across refresh rotations, so
   * the underlying server-side session row — and therefore its revocation
   * state — persists even as the tokens themselves rotate.
   */
  sid: string;
  /**
   * Key identifier (see #1489, #1686). A stable, content-derived id for the
   * signing secret so the verifier can select the correct HMAC secret without
   * trying every key. Tokens signed before multi-key support was added will
   * have no `kid`; the verifier falls back to the current key for those.
   */
  kid?: string;
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/**
 * Creates an HMAC-signed, time-bound session token of the form
 * `<base64url payload>.<base64url signature>`. Deliberately a lightweight,
 * self-contained token (HMAC over a small JSON payload via Node's built-in
 * crypto) rather than pulling in a JWT library — the payload here is two
 * fields and one signature algorithm, so a full JWT implementation (header,
 * multiple alg support, etc.) would add a dependency to solve a problem this
 * doesn't have.
 */
export function createSessionToken(
  publicKey: string,
  type: SessionTokenType,
  ttlSec: number,
  opts: { remember?: boolean; sid?: string } = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const currentKey = getCurrentKey();
  const payload: SessionTokenPayload = {
    sub: publicKey,
    typ: type,
    iat: now,
    exp: now + ttlSec,
    jti: randomUUID(),
    // Callers that mint an access/refresh pair for the same login (or that
    // rotate an existing session) pass the shared `sid` explicitly so both
    // tokens — and every token that follows from rotating them — resolve
    // to the same lib/sessionStore.ts row. A bare, sid-less call (e.g. in
    // tests exercising the token format alone) still gets a valid, unique
    // sid rather than an error.
    sid: opts.sid ?? randomUUID(),
    // Embed the stable, content-derived key-id so verifySessionToken can
    // select the right secret during a grace period after rotation (#1686).
    kid: currentKey.id,
    ...(type === 'refresh' ? { remember: !!opts.remember } : {}),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64, currentKey.secret)}`;
}

/**
 * Verifies a session token's signature and expiry, returning its payload or
 * null.  Key selection prefers the token's `kid` (#1686): a stable,
 * content-derived id resolves to exactly one secret, so the common path
 * performs a single HMAC.  Legacy tokens minted before #1686 carry a
 * positional `kid` ("0", "1", ...) that no longer names a key after a
 * rotation; those — and tokens with no `kid` at all — fall back to trying
 * every configured key.
 *
 * TODO(2025-01-01, #1686): remove the legacy positional-kid fallback once
 * max(ACCESS_TOKEN_TTL_SEC, REMEMBER_ME_REFRESH_TTL_SEC) (30 days) has
 * elapsed since the stable-kid rollout — by then no live token can carry a
 * positional kid.
 */
export function verifySessionToken(token: string): SessionTokenPayload | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  let payload: SessionTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;

  const keys = getSigningKeys();
  const candidates: SigningKey[] = [];
  if (typeof payload.kid === 'string') {
    const byKid = findKeyById(payload.kid);
    if (byKid) {
      candidates.push(byKid);
    } else if (isLegacyPositionalKid(payload.kid)) {
      // Legacy positional kid from before #1686 — try every key.
      console.warn(
        `[session] legacy positional kid "${payload.kid}" — falling back to all keys (#1686)`,
      );
      candidates.push(...keys);
    } else {
      return null;
    }
  } else {
    // No kid at all (pre-#1489 tokens): try every key.
    candidates.push(...keys);
  }

  const expected = Buffer.from(signature, 'base64url');
  for (const key of candidates) {
    const actual = Buffer.from(sign(payloadB64, key.secret), 'base64url');
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) {
      if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      return payload;
    }
  }
  return null;
}

/**
 * Reads and verifies the `session` cookie on an incoming request, returning
 * the caller's public key or null.  Also consults lib/sessionStore.ts so a
 * revoked `sid` is rejected even while its token is still cryptographically
 * valid (see #1179).
 */
export async function getSessionWallet(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload || payload.typ !== 'access') return null;
  if (!(await SessionStore.isActive(payload.sid))) return null;
  return payload.sub;
}
