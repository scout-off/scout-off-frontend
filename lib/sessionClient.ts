/**
 * Client-side helpers for reconciling the app's auth state with the
 * server's session cookies. See #778 — context/WalletContext.tsx must
 * treat the server (not localStorage) as the source of truth for
 * `isAuthenticated`/`publicKey`.
 */
import { fetchWithRetry } from '@/lib/fetchWithRetry';

export interface ServerSession {
  authenticated: boolean;
  publicKey: string | null;
}

/**
 * Calls GET /api/auth/session. Returns `null` (not a session result) when
 * the check itself was inconclusive — a network error or an unexpected
 * server error — so callers can distinguish "the server says you're not
 * authenticated" from "we couldn't ask the server right now" and avoid
 * forcing a logout on a transient blip.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  try {
    const res = await fetchWithRetry('/api/auth/session');
    if (res.status === 401) return { authenticated: false, publicKey: null };
    if (!res.ok) return null;
    const data = await res.json();
    return {
      authenticated: !!data.authenticated,
      publicKey: typeof data.publicKey === 'string' ? data.publicKey : null,
    };
  } catch {
    return null;
  }
}

// Single-flight refresh: if several callers all discover an expired/absent
// session around the same time (e.g. several authenticated requests 401
// concurrently), they must share one in-flight POST /api/auth/refresh
// rather than each firing their own — see #778's refresh-race requirement.
let inFlightRefresh: Promise<ServerSession> | null = null;

/**
 * Calls POST /api/auth/refresh, rotating the session. Concurrent callers
 * while a refresh is already in flight are given the same promise instead
 * of triggering their own request.
 *
 * Deliberately a bare `fetch`, not `fetchWithRetry`: this rotates the
 * session, so it isn't idempotent — an automatic retry after a lost
 * response could invalidate the session the first, successful attempt just
 * issued.
 */
export function refreshSession(): Promise<ServerSession> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async (): Promise<ServerSession> => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST' });
      if (!res.ok) return { authenticated: false, publicKey: null };
      const data = await res.json();
      return {
        authenticated: true,
        publicKey: typeof data.publicKey === 'string' ? data.publicKey : null,
      };
    } catch {
      return { authenticated: false, publicKey: null };
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}
