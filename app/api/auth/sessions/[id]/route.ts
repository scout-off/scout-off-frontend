import { NextRequest, NextResponse } from 'next/server';
import { createRequestLogger, withRequestId } from '@/lib/logger';
import { getSessionId, getSessionWallet } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

// better-sqlite3 (via lib/sessionStore.ts) is a native addon and needs the
// Node.js runtime, not edge.
export const runtime = 'nodejs';

/**
 * DELETE /api/auth/sessions/:id
 *
 * Revokes a single session belonging to the caller's wallet (issue #1187's
 * per-session counterpart to POST /api/auth/logout-all's "revoke every
 * session" sweep). The target row must belong to the requesting wallet —
 * looked up via SessionStore.listForWallet rather than trusting `:id`
 * outright, so one wallet can never revoke another wallet's session by
 * guessing or observing a session id.
 *
 * Revocation is immediate and server-side (SessionStore.revoke flips
 * revoked_at), so the targeted cookie is rejected on its very next request
 * regardless of its own unexpired `exp` — see lib/session.ts's
 * getSessionWallet, which checks SessionStore.isActive in addition to the
 * token's signature.
 *
 * Revoking the caller's *own* current session is allowed (the UI warns
 * before doing this — see components/ActiveSessions.tsx) and, like
 * logout-all, also clears this response's cookies so the browser doesn't
 * keep showing a now-dead session until the next reconciliation.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const log = createRequestLogger(req);

  const wallet = getSessionWallet(req);
  if (!wallet) {
    return withRequestId(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      log.requestId,
    );
  }

  const store = SessionStore.getInstance();
  const owned = store
    .listForWallet(wallet)
    .some((row) => row.id === params.id);
  if (!owned) {
    return withRequestId(
      NextResponse.json({ error: 'Session not found' }, { status: 404 }),
      log.requestId,
    );
  }

  // Captured before revoking: getSessionId itself checks isActive, so
  // reading it after store.revoke() below would always come back null —
  // including for the very case (revoking one's own current session) this
  // is meant to detect.
  const currentSid = getSessionId(req);

  const revoked = store.revoke(params.id);
  if (!revoked) {
    return withRequestId(
      NextResponse.json(
        { error: 'Session already revoked' },
        { status: 409 },
      ),
      log.requestId,
    );
  }

  const response = NextResponse.json({ success: true });
  if (params.id === currentSid) {
    response.cookies.delete('session');
    response.cookies.delete({ name: 'session_refresh', path: '/api/auth' });
  }
  return withRequestId(response, log.requestId);
}
