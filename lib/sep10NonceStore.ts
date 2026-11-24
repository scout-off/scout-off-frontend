/**
 * sep10NonceStore — SQLite-backed consumed-nonce registry for SEP-10 replay
 * protection (see #1488).
 *
 * Problem:
 *   POST /api/auth/sep10 verifies a signed challenge XDR (signature + time
 *   bounds), but never records that the XDR was used. Any copy of the same
 *   signed XDR (proxy log, browser extension, intercepted request) can be
 *   re-submitted within the challenge's 300 s validity window to obtain an
 *   independent new session.
 *
 * Fix:
 *   Before minting a session, compute sha256(signedXdr) and INSERT it into
 *   this store with the challenge's own maxTime as the expiry. If a row for
 *   that hash already exists, the XDR has already been consumed — reject
 *   with 401. Because the INSERT uses `INSERT OR IGNORE` semantics (via
 *   `OR IGNORE`), the check-and-mark is a single atomic SQLite operation —
 *   no TOCTOU window.
 *
 * Storage:
 *   Rows older than their expires_at are inert (isActive returns false) and
 *   are cleaned up lazily by sweepExpired(), called opportunistically from
 *   the route handler after every successful login. In the worst case, the
 *   table accumulates at most (3600 / 300) = 12 rows per unique wallet per
 *   hour, which is negligible.
 *
 * Mirrors lib/sessionStore.ts's conventions: one table, idempotent DDL run
 * on construction, process-wide singleton, DB bootstrap via lib/sqliteDb.ts.
 */
import { createHash } from 'crypto';
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sep10_nonces (
  hash       TEXT    PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sep10_nonces_expires_at ON sep10_nonces(expires_at);
`;

export class Sep10NonceStore {
  private static _instance: Sep10NonceStore | null = null;

  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(SCHEMA);
  }

  static getInstance(): Sep10NonceStore {
    if (!Sep10NonceStore._instance) {
      Sep10NonceStore._instance = new Sep10NonceStore(
        openSqliteDb('sep10_nonces.db', 'SEP10_NONCES_DB_PATH'),
      );
    }
    return Sep10NonceStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (Sep10NonceStore._instance) {
      Sep10NonceStore._instance.db.close();
    }
    Sep10NonceStore._instance = null;
  }

  /**
   * Hashes a raw signed XDR string with sha256 and returns the hex digest.
   * Extracted as a static helper so callers can pre-compute the hash once
   * (avoiding a second hash on the logging path) and tests can inspect it.
   */
  static hashXdr(signedXdr: string): string {
    return createHash('sha256').update(signedXdr, 'utf8').digest('hex');
  }

  /**
   * Marks a signed XDR as consumed.
   *
   * @param hash      sha256 hex digest of the signed XDR (use hashXdr).
   * @param expiresAt Challenge maxTime in unix *seconds* (as-is from Stellar
   *                  time bounds — stored and compared in seconds).
   * @returns true if this is the first consumption (caller should proceed to
   *          mint a session), false if the nonce was already present (replay
   *          — caller should reject with 401).
   *
   * Implementation: `INSERT OR IGNORE` is a single atomic statement in
   * SQLite. If the row already exists the INSERT is silently skipped and
   * `changes` is 0 — no separate SELECT needed, no TOCTOU gap.
   */
  consumeNonce(hash: string, expiresAt: number): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO sep10_nonces (hash, expires_at) VALUES (?, ?)`,
      )
      .run(hash, expiresAt);
    return result.changes > 0;
  }

  /**
   * Removes all rows whose expires_at is in the past (unix seconds).
   * Called opportunistically after each successful login — keeps the table
   * from growing without bound while avoiding a synchronous cleanup on the
   * replay-rejection hot path.
   *
   * @returns number of rows deleted.
   */
  sweepExpired(): number {
    const nowSec = Math.floor(Date.now() / 1000);
    return this.db
      .prepare(`DELETE FROM sep10_nonces WHERE expires_at <= ?`)
      .run(nowSec).changes;
  }

  close(): void {
    this.db.close();
  }
}
