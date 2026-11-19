import { NextRequest, NextResponse } from 'next/server';
import { createRequestLogger, withRequestId } from '@/lib/logger';
import {
  createSessionToken,
  verifySessionToken,
  ACCESS_TOKEN_TTL_SEC,
  DEFAULT_REFRESH_TTL_SEC,
  REMEMBER_ME_REFRESH_TTL_SEC,
} from '@/lib/session';
import {
  clearSessionCookies,
  REFRESH_COOKIE,
  setSessionCookies,
} from '@/lib/sessionCookies';
import { SessionStore } from '@/lib/sessionStore';
import { withRouteTelemetry } from '@/lib/telemetry';

// better-sqlite3 (via lib/sessionStore.ts) is a native addon and needs the
// Node.js runtime, not edge.
export const runtime = 'nodejs';

/**
 * POST /api/auth/refresh
 *
 * Rotates a caller's session: verifies the long-lived `session_refresh`
 * cookie (issued alongside `session` by POST /api/auth/sep10) and, if it's
 * still valid, issues a brand-new access token AND a brand-new refresh
 * token — both cookies are reissued so an intercepted, already-rotated
 * refresh token can't be reused. See #778: without this endpoint, a
 * silently-expired access token had no recovery path other than a full
 * SEP-10 challenge/response.
 *
 * Does NOT require a valid SEP-10 signature — that's the point of a
 * refresh token — but does require possession of a refresh token this
 * server itself issued (HMAC-verified, see lib/session.ts), so it cannot be
 * used to mint a session for an address that never completed SEP-10.
 *
 * See #1292: refresh tokens are rotated with reuse detection (a
 * refresh-token family keyed by `sid`). The session row records the
 * currently-valid refresh `jti`; presenting any older `jti` is treated as
 * token theft and revokes the whole session. A short grace window lets
 * concurrent refreshes from multiple tabs succeed without false positives,
 * and an absolute lifetime caps how long a session can be extended.
 */
async function postRefresh(req: NextRequest) {
  const log = createRequestLogger(req);
  const refreshCookie = req.cookies.get(REFRESH_COOKIE);

  if (!refreshCookie) {
    return withRequestId(
      NextResponse.json({ error: 'No refresh session' }, { status: 401 }),
      log.requestId,
    );
  }

  const payload = verifySessionToken(refreshCookie.value, 'refresh');
  // See #1179: a signature-valid, unexpired refresh token is no longer
  // sufficient by itself — its underlying session must still be active
  // server-side too (not revoked via disconnect() or "log out of all
  // devices"). A revoked session must not be silently renewed.
  if (!payload || !SessionStore.getInstance().isActive(payload.sid)) {
    const response = NextResponse.json(
      { error: 'Refresh session invalid or expired' },
      { status: 401 },
    );
    clearSessionCookies(response);
    return withRequestId(response, log.requestId);
  }

  const store = SessionStore.getInstance();
  const now = Date.now();

  // See #1292: refuse to extend a session past its absolute lifetime. The
  // user must complete a fresh SEP-10 challenge to start a new session.
  const absoluteExpiresAt = store.getAbsoluteExpiresAt(payload.sid);
  if (absoluteExpiresAt !== null && now >= absoluteExpiresAt) {
    store.revoke(payload.sid);
    log.warn('refresh rejected: absolute session lifetime exceeded', {
      sid: payload.sid,
    });
    const response = NextResponse.json(
      { error: 'Session lifetime exceeded; please sign in again' },
      { status: 401 },
    );
    clearSessionCookies(response);
    return withRequestId(response, log.requestId);
  }

  // See #1292: reuse detection. The presented `jti` must match the session's
  // current refresh `jti`, or be the immediately-previous one within the
  // grace window (concurrent tabs). Anything else is a replayed, already-
  // rotated token — treat it as theft and revoke the whole session.
  const rotation = store.checkRefreshJti(payload.sid, payload.jti, now);
  if (rotation === 'reuse') {
    store.revoke(payload.sid);
    log.warn('refresh token reuse detected; session revoked', {
      sid: payload.sid,
    });
    const response = NextResponse.json(
      { error: 'Refresh session invalid or expired' },
      { status: 401 },
    );
    clearSessionCookies(response);
    return withRequestId(response, log.requestId);
  }

  const remember = !!payload.remember;
  const refreshTtl = remember
    ? REMEMBER_ME_REFRESH_TTL_SEC
    : DEFAULT_REFRESH_TTL_SEC;

  // The rotated tokens keep the SAME sid as the token being rotated — the
  // underlying session (and its revocation state) is what persists across
  // a refresh, even though the token strings themselves are brand new.
  const accessToken = createSessionToken(
    payload.sub,
    'access',
    ACCESS_TOKEN_TTL_SEC,
    { sid: payload.sid },
  );
  const rotatedRefreshToken = createSessionToken(
    payload.sub,
    'refresh',
    refreshTtl,
    { remember, sid: payload.sid },
  );
  const rotatedPayload = verifySessionToken(rotatedRefreshToken, 'refresh');
  store.rotateRefreshJti(
    payload.sid,
    rotatedPayload?.jti ?? null,
    now + refreshTtl * 1000,
  );

  const response = NextResponse.json({
    success: true,
    publicKey: payload.sub,
    maxAge: refreshTtl,
  });
  setSessionCookies(response, {
    accessToken,
    refreshToken: rotatedRefreshToken,
    refreshMaxAge: refreshTtl,
  });
  return withRequestId(response, log.requestId);
}

export const POST = withRouteTelemetry(postRefresh, '/api/auth/refresh');
