import { NextRequest } from 'next/server';
import { createRequestLogger, withRequestId } from '@/lib/logger';
import { getSessionWallet } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';
import { privateJson } from '@/lib/httpResponses';

// better-sqlite3 (via lib/sessionStore.ts) is a native addon and needs the
// Node.js runtime, not edge.
export const runtime = 'nodejs';

/**
 * POST /api/auth/logout-all
 *
 * "Log out of all devices" (see #1179): revokes every currently active
 * session for the caller's wallet — every browser/device that has ever
 * completed SEP-10 and not since been revoked or expired — not just the
 * one making this request. Complements DELETE /api/auth/sep10, which only
 * revokes the current session.
 *
 * Requires a currently valid session (the caller must prove who they are
 * before wiping every session for that wallet). The caller's own cookies
 * are cleared in the response too, since the row they mapped to is part of
 * the same sweep.
 */
export async function POST(req: NextRequest) {
  const log = createRequestLogger(req);

  const wallet = getSessionWallet(req);
  if (!wallet) {
    return withRequestId(
      privateJson({ error: 'Unauthorized' }, { status: 401 }),
      log.requestId,
    );
  }

  const revoked = SessionStore.getInstance().revokeAllForWallet(wallet);

  const response = privateJson({ success: true, revoked });
  response.cookies.delete('session');
  response.cookies.delete({ name: 'session_refresh', path: '/api/auth' });
  return withRequestId(response, log.requestId);
}
