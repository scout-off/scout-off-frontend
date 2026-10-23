/**
 * Client-side helpers for reconciling the app's auth state with the
 * server's session cookies. See #778 — context/WalletContext.tsx must
 * treat the server (not localStorage) as the source of truth for
 * `isAuthenticated`/`publicKey`.
 *
 * Cross-tab refresh coordination (#1473):
 * `inFlightRefresh` deduplicates concurrent callers *within one tab*, but
 * every open tab runs its own expiry timer, so without further coordination
 * they race each other to POST /api/auth/refresh.  Once refresh-token reuse
 * detection (#1292) lands the losing tab will invalidate every session.
 *
 * Strategy — BroadcastChannel + sessionStorage leader election:
 *   1. The first tab to notice expiry acquires a short-lived lock stored in
 *      `sessionStorage` (cross-tab via StorageEvent) and broadcasts a
 *      "refresh-started" message on a shared BroadcastChannel.
 *   2. All other tabs receive the message and wait for either
 *      "refresh-result" (success/failure payload) or a timeout before
 *      they decide to refresh themselves.
 *   3. When the leader finishes it broadcasts "refresh-result" with the
 *      session and releases the lock.
 *   4. Followers receive the result and resolve their own waiters without
 *      ever touching the network.
 *
 * Fallback: BroadcastChannel is not available in all environments (SSR,
 * some legacy browsers, test runners).  When it is absent the code falls
 * back to the original single-tab behaviour — the worst-case is the same
 * race that exists today, not a regression.
 */
import { fetchWithRetry } from '@/lib/fetchWithRetry';

export interface ServerSession {
  authenticated: boolean;
  publicKey: string | null;
}

// ── BroadcastChannel types ───────────────────────────────────────────────────

type RefreshMessage =
  | { type: 'refresh-started' }
  | { type: 'refresh-result'; session: ServerSession };

// ── BroadcastChannel singleton (lazy, SSR-safe) ──────────────────────────────

const CHANNEL_NAME = 'scout-session-refresh';
const LOCK_KEY = 'scout-session-refresh-lock';
/** ms a tab waits for the leader to finish before deciding to refresh itself */
const FOLLOWER_TIMEOUT_MS = 8_000;

let _channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!_channel) {
    _channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return _channel;
}

// ── Within-tab dedup (unchanged from original) ───────────────────────────────

let inFlightRefresh: Promise<ServerSession> | null = null;

// ── Cross-tab coordination ───────────────────────────────────────────────────

/**
 * Attempt to acquire the cross-tab refresh "lock".
 *
 * Uses sessionStorage (synchronously readable by all tabs under the same
 * origin in the same session) to record a lock timestamp. Returns true when
 * the current tab becomes the leader, false when another tab already holds
 * the lock and its timestamp is still within the leader timeout.
 */
function tryAcquireLock(): boolean {
  try {
    const existing = sessionStorage.getItem(LOCK_KEY);
    if (existing) {
      const ts = parseInt(existing, 10);
      if (Date.now() - ts < FOLLOWER_TIMEOUT_MS) {
        return false; // another tab holds the lock
      }
    }
    sessionStorage.setItem(LOCK_KEY, String(Date.now()));
    return true;
  } catch {
    // sessionStorage unavailable (private browsing, SSR) — fall through to
    // single-tab behaviour.
    return true;
  }
}

function releaseLock(): void {
  try {
    sessionStorage.removeItem(LOCK_KEY);
  } catch {
    // ignore
  }
}

/**
 * Waits for a "refresh-result" broadcast from the leader tab, with a
 * timeout safety-net.  Resolves to the session the leader obtained, or
 * `null` if the wait timed out (the caller should then attempt its own
 * refresh).
 */
function waitForLeaderResult(): Promise<ServerSession | null> {
  return new Promise((resolve) => {
    const channel = getChannel();
    if (!channel) {
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      channel.removeEventListener('message', handler);
      resolve(null); // timed out — caller will refresh itself
    }, FOLLOWER_TIMEOUT_MS);

    const handler = (event: MessageEvent<RefreshMessage>) => {
      if (event.data.type === 'refresh-result') {
        clearTimeout(timer);
        channel.removeEventListener('message', handler);
        resolve(event.data.session);
      }
    };

    channel.addEventListener('message', handler);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

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

/**
 * Calls POST /api/auth/refresh, rotating the session.
 *
 * Deduplication operates on two levels:
 *   - Within the same tab: concurrent callers share the same in-flight
 *     promise (`inFlightRefresh`), as before.
 *   - Across tabs: a BroadcastChannel + sessionStorage leader-election
 *     scheme (#1473) ensures only one tab sends the POST. Other tabs wait
 *     for the leader's result broadcast and resolve without hitting the
 *     network, preventing refresh-token reuse collisions.
 *
 * Deliberately a bare `fetch`, not `fetchWithRetry`: this rotates the
 * session, so it isn't idempotent — an automatic retry after a lost
 * response could invalidate the session the first, successful attempt just
 * issued.
 */
export function refreshSession(): Promise<ServerSession> {
  // Within-tab dedup: all concurrent callers in this tab share one promise.
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async (): Promise<ServerSession> => {
    try {
      const channel = getChannel();

      // Try to become the cross-tab leader.
      const isLeader = tryAcquireLock();

      if (!isLeader) {
        // Another tab is already refreshing. Wait for it to broadcast the
        // result rather than racing it.
        const result = await waitForLeaderResult();
        if (result !== null) {
          return result;
        }
        // Leader timed out without broadcasting. Re-attempt to acquire the
        // lock and refresh ourselves.
        sessionStorage.removeItem(LOCK_KEY);
        if (!tryAcquireLock()) {
          // Yet another tab grabbed it in the meantime — wait once more.
          const retry = await waitForLeaderResult();
          if (retry !== null) return retry;
          // Give up waiting and fall through to an independent refresh.
        }
      }

      // We are the leader (or BroadcastChannel is unavailable). Do the
      // actual network call.
      if (channel) {
        channel.postMessage({ type: 'refresh-started' } satisfies RefreshMessage);
      }

      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        let session: ServerSession;
        if (!res.ok) {
          session = { authenticated: false, publicKey: null };
        } else {
          let publicKey: string | null = null;
          try {
            const data = await res.json();
            publicKey = typeof data.publicKey === 'string' ? data.publicKey : null;
          } catch {
            // body unreadable — treat as authenticated but publicKey unknown
          }
          session = { authenticated: true, publicKey };
        }

        // Broadcast the result to all waiting follower tabs.
        if (channel) {
          channel.postMessage({
            type: 'refresh-result',
            session,
          } satisfies RefreshMessage);
        }

        return session;
      } catch {
        const session: ServerSession = { authenticated: false, publicKey: null };
        if (channel) {
          channel.postMessage({
            type: 'refresh-result',
            session,
          } satisfies RefreshMessage);
        }
        return session;
      } finally {
        releaseLock();
      }
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

/**
 * Test-only: tears down the cached BroadcastChannel so tests that stub
 * `BroadcastChannel` get a fresh instance on the next `refreshSession` call.
 */
export function _resetSessionClientForTests(): void {
  _channel?.close();
  _channel = null;
  inFlightRefresh = null;
  releaseLock();
}
