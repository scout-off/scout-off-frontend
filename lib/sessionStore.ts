/**
 * sessionStore — SQLite-backed server-side session registry (see #1179).
 *
 * lib/session.ts's access/refresh cookies are HMAC-signed and time-bound,
 * but a signature alone can't be revoked early — there was no way to
 * invalidate a specific still-valid cookie before its own `exp`, e.g. to
 * support "log out of all devices" or to react to a compromised device.
 *
 * Every login now mints a random opaque session id (`sid`) shared by that
 * login's access and refresh token pair (and carried forward across
 * refresh-token rotations, so the underlying session persists even though
 * the tokens themselves rotate). This store is the source of truth for
 * whether a given `sid` is still active: lib/session.ts's getSessionWallet
 * and app/api/auth/refresh's rotation both check `isActive()` in addition
 * to verifying the token's signature, so revoking a row here rejects that
 * cookie on its very next request even though the token remains
 * cryptographically valid until its `exp`.
 *
 * Refresh-token rotation with reuse detection (see #1292): each session
 * row records the `jti` of the refresh token currently in circulation
 * (`current_refresh_jti`) plus the previous one and when it was rotated
 * (`previous_refresh_jti` / `rotated_at`), so a short grace window can
 * absorb concurrent refreshes from multiple tabs without looking like
 * theft. Presenting any older `jti` revokes the whole session. Rows also
 * carry an `absolute_expires_at` cap so a session can never be extended
 * indefinitely by repeated refreshes.
 *
 * Mirrors lib/watchlistStore.ts / lib/notificationReadStore.ts's
 * conventions: one table, idempotent `CREATE TABLE IF NOT EXISTS` DDL run
 * on construction, a process-wide singleton, DB bootstrap shared via
 * lib/sqliteDb.ts.
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON sessions(wallet);
`;

/**
 * Columns added after the initial schema. Applied idempotently on
 * construction so existing databases pick them up without a separate
 * migration runner.
 */
const ADDED_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'current_refresh_jti', ddl: 'TEXT' },
  { name: 'previous_refresh_jti', ddl: 'TEXT' },
  { name: 'rotated_at', ddl: 'INTEGER' },
  { name: 'absolute_expires_at', ddl: 'INTEGER' },
];

export interface SessionRow {
  id: string;
  wallet: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  revokedAt: number | null;
  userAgent: string | null;
  currentRefreshJti: string | null;
  previousRefreshJti: string | null;
  rotatedAt: number | null;
  absoluteExpiresAt: number | null;
}

interface RawSessionRow {
  id: string;
  wallet: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
  revoked_at: number | null;
  user_agent: string | null;
  current_refresh_jti: string | null;
  previous_refresh_jti: string | null;
  rotated_at: number | null;
  absolute_expires_at: number | null;
}

function rowToSession(row: RawSessionRow): SessionRow {
  return {
    id: row.id,
    wallet: row.wallet,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    userAgent: row.user_agent,
    currentRefreshJti: row.current_refresh_jti,
    previousRefreshJti: row.previous_refresh_jti,
    rotatedAt: row.rotated_at,
    absoluteExpiresAt: row.absolute_expires_at,
  };
}

/**
 * Outcome of a refresh-token rotation attempt. `ok` carries the new
 * `expiresAt` the caller should stamp on the rotated token; the failure
 * variants tell the caller whether to revoke the session (theft) or just
 * reject the refresh (expired / unknown).
 */
export type RotateResult =
  | { status: 'ok'; expiresAt: number }
  | { status: 'reuse' }
  | { status: 'absolute_expired' }
  | { status: 'inactive' };

export class SessionStore {
  private static _instance: SessionStore | null = null;

  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(SCHEMA);
    this.migrate();
  }

  /** Adds any post-initial columns that are missing from an existing DB. */
  private migrate(): void {
    const existing = new Set(
      (
        this.db.prepare('PRAGMA table_info(sessions)').all() as Array<{
          name: string;
        }>
      ).map((c) => c.name),
    );
    for (const col of ADDED_COLUMNS) {
      if (!existing.has(col.name)) {
        this.db.exec(`ALTER TABLE sessions ADD COLUMN ${col.name} ${col.ddl}`);
      }
    }
  }

  static getInstance(): SessionStore {
    if (!SessionStore._instance) {
      SessionStore._instance = new SessionStore(
        openSqliteDb('sessions.db', 'SESSIONS_DB_PATH'),
      );
    }
    return SessionStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (SessionStore._instance) {
      SessionStore._instance.db.close();
    }
    SessionStore._instance = null;
  }

  /**
   * Registers a freshly-issued session id, mapped to `wallet`, expiring at
   * `expiresAt` (epoch ms) — the same instant the paired refresh cookie's
   * `maxAge` would naturally expire it.
   *
   * `refreshJti` is the `jti` of the refresh token minted alongside this
   * session; `absoluteExpiresAt` caps how far repeated refreshes may extend
   * the session (see #1292).
   */
  create(
    id: string,
    wallet: string,
    expiresAt: number,
    userAgent?: string | null,
    refreshJti?: string | null,
    absoluteExpiresAt?: number | null,
  ): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO sessions (id, wallet, created_at, expires_at, last_seen_at, revoked_at, user_agent, current_refresh_jti, previous_refresh_jti, rotated_at, absolute_expires_at)
         VALUES (@id, @wallet, @created_at, @expires_at, @last_seen_at, NULL, @user_agent, @current_refresh_jti, NULL, NULL, @absolute_expires_at)`,
      )
      .run({
        id,
        wallet,
        created_at: now,
        expires_at: expiresAt,
        last_seen_at: now,
        user_agent: userAgent ?? null,
        current_refresh_jti: refreshJti ?? null,
        absolute_expires_at: absoluteExpiresAt ?? null,
      });
  }

  /**
   * Extends an existing, still-active session's expiry and bumps its
   * last-seen timestamp — called on refresh-token rotation so the
   * underlying session id (and therefore its revocation state) survives
   * across rotations instead of each refresh minting an unrelated session.
   * No-op if the session doesn't exist or is already revoked.
   */
  touch(id: string, expiresAt: number): void {
    this.db
      .prepare(
        `UPDATE sessions SET expires_at = ?, last_seen_at = ?
         WHERE id = ? AND revoked_at IS NULL`,
      )
      .run(expiresAt, Date.now(), id);
  }

  /**
   * Rotates the refresh token for `id` from `presentedJti` to `newJti`,
   * enforcing reuse detection and the absolute lifetime cap (see #1292).
   *
   * - If the session is missing/revoked/expired → `inactive`.
   * - If `presentedJti` matches the current jti → rotate, returning the
   *   new `expiresAt` (clamped to `absoluteExpiresAt`).
   * - If `presentedJti` matches the previous jti and we are still inside
   *   `graceMs` of the last rotation → accept once (concurrent tabs) and
   *   rotate again.
   * - Otherwise the presented jti is stale → `reuse`; the caller must
   *   revoke the session.
   * - If the session is already past `absoluteExpiresAt` → `absolute_expired`.
   */
  rotate(
    id: string,
    presentedJti: string,
    newJti: string,
    refreshTtlMs: number,
    graceMs: number,
  ): RotateResult {
    const row = this.db
      .prepare(
        `SELECT revoked_at, expires_at, current_refresh_jti, previous_refresh_jti, rotated_at, absolute_expires_at
         FROM sessions WHERE id = ?`,
      )
      .get(id) as
      | {
          revoked_at: number | null;
          expires_at: number;
          current_refresh_jti: string | null;
          previous_refresh_jti: string | null;
          rotated_at: number | null;
          absolute_expires_at: number | null;
        }
      | undefined;

    if (!row) return { status: 'inactive' };
    if (row.revoked_at !== null) return { status: 'inactive' };

    const now = Date.now();
    if (row.expires_at < now) return { status: 'inactive' };

    if (row.absolute_expires_at !== null && now >= row.absolute_expires_at) {
      return { status: 'absolute_expired' };
    }

    const isCurrent =
      row.current_refresh_jti !== null &&
      row.current_refresh_jti === presentedJti;
    const isGracePrevious =
      !isCurrent &&
      row.previous_refresh_jti !== null &&
      row.previous_refresh_jti === presentedJti &&
      row.rotated_at !== null &&
      now - row.rotated_at <= graceMs;

    if (!isCurrent && !isGracePrevious) {
      return { status: 'reuse' };
    }

    let expiresAt = now + refreshTtlMs;
    if (row.absolute_expires_at !== null) {
      expiresAt = Math.min(expiresAt, row.absolute_expires_at);
    }

    this.db
      .prepare(
        `UPDATE sessions
         SET expires_at = @expires_at,
             last_seen_at = @now,
             previous_refresh_jti = current_refresh_jti,
             current_refresh_jti = @new_jti,
             rotated_at = @now
         WHERE id = @id AND revoked_at IS NULL`,
      )
      .run({ id, expires_at: expiresAt, now, new_jti: newJti });

    return { status: 'ok', expiresAt };
  }

  /**
   * Whether `id` is a currently active session: exists, has not been
   * revoked, and has not passed its stored expiry. This is the check that
   * gives revocation real teeth — a token can still verify
   * cryptographically after its session row is gone or flagged revoked, so
   * callers MUST treat that as unauthenticated regardless of the token's
   * own `exp` claim.
   */
  isActive(id: string): boolean {
    const row = this.db
      .prepare('SELECT revoked_at, expires_at FROM sessions WHERE id = ?')
      .get(id) as { revoked_at: number | null; expires_at: number } | undefined;
    if (!row) return false;
    if (row.revoked_at !== null) return false;
    if (row.expires_at < Date.now()) return false;
    return true;
  }

  /**
   * Flags a single session revoked (a soft delete — the row is kept for
   * audit purposes). Returns false if the session didn't exist or was
   * already revoked.
   */
  revoke(id: string): boolean {
    const result = this.db
      .prepare(
        'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
      )
      .run(Date.now(), id);
    return result.changes > 0;
  }

  /**
   * Flags every currently-active session belonging to `wallet` revoked —
   * the "log out of all devices" primitive. Returns the number of sessions
   * revoked.
   */
  revokeAllForWallet(wallet: string): number {
    const result = this.db
      .prepare(
        'UPDATE sessions SET revoked_at = ? WHERE wallet = ? AND revoked_at IS NULL',
      )
      .run(Date.now(), wallet);
    return result.changes;
  }

  /** Lists every session row (active or revoked) for wallet, newest first. */
  listForWallet(wallet: string): SessionRow[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM sessions WHERE wallet = ? ORDER BY created_at DESC',
      )
      .all(wallet) as RawSessionRow[];
    return rows.map(rowToSession);
  }

  /**
   * Deletes every session row for `wallet` (data-deletion cascade). Callers
   * should revokeAllForWallet first so no live session outlives the request.
   */
  deleteForWallet(wallet: string): number {
    return this.db.prepare('DELETE FROM sessions WHERE wallet = ?').run(wallet)
      .changes;
  }

  /**
   * Data-retention pruning (issue #1477).
   *
   * Hard-deletes rows that are no longer needed:
   *   - Rows that are past their `expires_at` AND have been expired for at
   *     least `auditRetentionMs` (so recently-expired rows are kept for a
   *     short audit/debugging window).
   *   - Rows that were revoked AND the revocation is older than
   *     `auditRetentionMs` (same audit window for revoked sessions).
   *
   * Active sessions (revoked_at IS NULL, expires_at >= now) are never
   * touched. Returns the number of rows deleted.
   */
  pruneExpiredAndRevoked(nowMs: number, auditRetentionMs: number): number {
    const cutoff = nowMs - auditRetentionMs;
    const result = this.db
      .prepare(
        `DELETE FROM sessions
         WHERE (expires_at < @cutoff)
            OR (revoked_at IS NOT NULL AND revoked_at < @cutoff)`,
      )
      .run({ cutoff });
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}
