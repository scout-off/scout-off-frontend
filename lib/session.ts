import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export type SessionTokenType = 'access' | 'refresh';

export interface SessionTokenPayload extends JWTPayload {
  sid: string;
  sub: string;
  type: SessionTokenType;
  jti: string;
  remember?: boolean;
}

export interface SessionConfig {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  /** Absolute lifetime of a session, measured from the original SEP-10 login. */
  absoluteTtlSeconds: number;
  /** Absolute lifetime when the user did not opt into remember-me. */
  absoluteTtlSecondsNoRemember: number;
  /** Window during which the previous refresh jti is still accepted once (multi-tab). */
  refreshGraceSeconds: number;
  issuer: string;
  audience: string;
}

const DEFAULT_CONFIG: SessionConfig = {
  accessTtlSeconds: 15 * 60,
  refreshTtlSeconds: 30 * 24 * 60 * 60,
  absoluteTtlSeconds: 30 * 24 * 60 * 60,
  absoluteTtlSecondsNoRemember: 7 * 24 * 60 * 60,
  refreshGraceSeconds: 30,
  issuer: 'handsoff',
  audience: 'handsoff-session',
};

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret) {
    throw new Error('SESSION_JWT_SECRET is not configured');
  }
  return new TextEncoder().encode(secret);
}

function resolveConfig(overrides?: Partial<SessionConfig>): SessionConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

/**
 * Compute the absolute expiry for a session. This is fixed at SEP-10 login time
 * and never extended by refresh-token rotation, so a stolen refresh cookie can
 * only extend a session up to this hard cap.
 */
export function computeAbsoluteExpiry(
  remember: boolean,
  from: Date = new Date(),
  overrides?: Partial<SessionConfig>,
): Date {
  const config = resolveConfig(overrides);
  const ttl = remember ? config.absoluteTtlSeconds : config.absoluteTtlSecondsNoRemember;
  return new Date(from.getTime() + ttl * 1000);
}

/**
 * Whether a session may still be refreshed given its absolute expiry.
 * Returns false once the absolute lifetime has elapsed.
 */
export function canRefresh(
  absoluteExpiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!absoluteExpiresAt) return false;
  const expiry = typeof absoluteExpiresAt === 'string' ? new Date(absoluteExpiresAt) : absoluteExpiresAt;
  if (Number.isNaN(expiry.getTime())) return false;
  return now.getTime() < expiry.getTime();
}

/**
 * Determine whether a presented refresh jti is acceptable for a session row.
 *
 * - The current jti is always accepted.
 * - The previous jti is accepted once within the grace window so that two tabs
 *   refreshing concurrently do not look like token theft.
 * - Anything else is treated as reuse of a rotated token.
 */
export function isRefreshJtiAcceptable(params: {
  presentedJti: string;
  currentJti: string | null | undefined;
  previousJti: string | null | undefined;
  previousJtiRotatedAt: Date | string | null | undefined;
  now?: Date;
  overrides?: Partial<SessionConfig>;
}): { ok: boolean; usedPrevious: boolean } {
  const { presentedJti, currentJti, previousJti, previousJtiRotatedAt } = params;
  const now = params.now ?? new Date();
  const config = resolveConfig(params.overrides);

  if (currentJti && presentedJti === currentJti) {
    return { ok: true, usedPrevious: false };
  }

  if (previousJti && presentedJti === previousJti && previousJtiRotatedAt) {
    const rotatedAt =
      typeof previousJtiRotatedAt === 'string'
        ? new Date(previousJtiRotatedAt)
        : previousJtiRotatedAt;
    if (!Number.isNaN(rotatedAt.getTime())) {
      const elapsed = (now.getTime() - rotatedAt.getTime()) / 1000;
      if (elapsed >= 0 && elapsed <= config.refreshGraceSeconds) {
        return { ok: true, usedPrevious: true };
      }
    }
  }

  return { ok: false, usedPrevious: false };
}

export async function signSessionToken(
  payload: Omit<SessionTokenPayload, 'iat' | 'exp' | 'iss' | 'aud'>,
  ttlSeconds: number,
  overrides?: Partial<SessionConfig>,
): Promise<string> {
  const config = resolveConfig(overrides);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime(now + ttlSeconds)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
  expectedType: SessionTokenType,
  overrides?: Partial<SessionConfig>,
): Promise<SessionTokenPayload> {
  const config = resolveConfig(overrides);
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: config.issuer,
    audience: config.audience,
  });

  const typed = payload as SessionTokenPayload;
  if (typed.type !== expectedType) {
    throw new Error(`Unexpected session token type: expected ${expectedType}`);
  }
  if (!typed.sid || !typed.sub || !typed.jti) {
    throw new Error('Session token is missing required claims');
  }
  return typed;
}

export function getSessionConfig(overrides?: Partial<SessionConfig>): SessionConfig {
  return resolveConfig(overrides);
}
