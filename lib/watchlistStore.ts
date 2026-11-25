/**
 * watchlistStore — SQLite-backed persistence for scouts' player watchlists.
 * Mirrors lib/adminAuditStore.ts's conventions: a process-wide singleton,
 * DB bootstrap and schema shared via lib/sqliteDb.ts's openSqliteDb, with
 * schema applied through lib/sqliteMigrations.ts's versioned migration
 * runner (see lib/migrations/watchlistMigrations.ts).
 *
 * Per-wallet cap: each scout is limited to MAX_WATCHLIST_ENTRIES (500)
 * watchlist entries. The route layer enforces the cap before calling add()
 * and returns 409 when the limit is reached (issue #1507).
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';
import { watchlistMigrations } from './migrations/watchlistMigrations';
import { normalizeStellarAddress } from './stellar';
import { sanitize } from './sanitize';
import type { WatchlistEntry } from '@/types';

/**
 * Maximum number of watchlist entries allowed per scout wallet.
 * Exported so route handlers and tests can reference the canonical value.
 */
export const MAX_WATCHLIST_ENTRIES = 500;

interface WatchlistRow {
  id: number;
  scout_wallet: string;
  player_id: string;
  created_at: number;
  note: string | null;
  tags: string | null;
  updated_at: number | null;
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === 'string')
      : [];
  } catch {
    return [];
  }
}

function rowToEntry(row: WatchlistRow): WatchlistEntry {
  return {
    id: row.id,
    scoutWallet: row.scout_wallet,
    playerId: row.player_id,
    createdAt: row.created_at,
    // Sanitized on output; the UI renders these as text only, never HTML.
    note: sanitize(row.note ?? ''),
    tags: parseTags(row.tags).map(sanitize),
    updatedAt: row.updated_at ?? null,
  };
}

export class WatchlistStore {
  private static _instance: WatchlistStore | null = null;

  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static getInstance(): WatchlistStore {
    if (!WatchlistStore._instance) {
      WatchlistStore._instance = new WatchlistStore(
        openSqliteDb('watchlist.db', 'WATCHLIST_DB_PATH', watchlistMigrations),
      );
    }
    return WatchlistStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (WatchlistStore._instance) {
      WatchlistStore._instance.db.close();
    }
    WatchlistStore._instance = null;
  }

  add(scoutWallet: string, playerId: string): WatchlistEntry {
    // Normalize both addresses to uppercase to prevent case-sensitivity duplicates
    const normalizedScoutWallet = normalizeStellarAddress(scoutWallet);
    const normalizedPlayerId = normalizeStellarAddress(playerId);

    this.db
      .prepare(
        `INSERT OR IGNORE INTO watchlist (scout_wallet, player_id, created_at)
         VALUES (@scout_wallet, @player_id, @created_at)`,
      )
      .run({
        scout_wallet: normalizedScoutWallet,
        player_id: normalizedPlayerId,
        created_at: Date.now(),
      });

    const row = this.db
      .prepare(
        'SELECT * FROM watchlist WHERE scout_wallet = ? AND player_id = ?',
      )
      .get(normalizedScoutWallet, normalizedPlayerId) as WatchlistRow;
    return rowToEntry(row);
  }

  /** Deletes an entry scoped to its owner. Returns false if not found or not owned by scoutWallet. */
  remove(scoutWallet: string, id: number): boolean {
    const normalizedScoutWallet = normalizeStellarAddress(scoutWallet);
    const result = this.db
      .prepare('DELETE FROM watchlist WHERE id = ? AND scout_wallet = ?')
      .run(id, normalizedScoutWallet);
    return result.changes > 0;
  }

  /**
   * Updates the note and tags of an entry scoped to its owner. Returns the
   * updated entry, or null if not found or not owned by scoutWallet.
   */
  updateNotes(
    scoutWallet: string,
    id: number,
    note: string,
    tags: string[],
  ): WatchlistEntry | null {
    const normalizedScoutWallet = normalizeStellarAddress(scoutWallet);
    const result = this.db
      .prepare(
        `UPDATE watchlist SET note = @note, tags = @tags, updated_at = @updated_at
         WHERE id = @id AND scout_wallet = @scout_wallet`,
      )
      .run({
        note: note || null,
        tags: tags.length > 0 ? JSON.stringify(tags) : null,
        updated_at: Date.now(),
        id,
        scout_wallet: normalizedScoutWallet,
      });
    if (result.changes === 0) return null;
    const row = this.db
      .prepare('SELECT * FROM watchlist WHERE id = ?')
      .get(id) as WatchlistRow;
    return rowToEntry(row);
  }

  /** Deletes every entry owned by scoutWallet. Returns the number of rows removed. */
  clearForWallet(scoutWallet: string): number {
    const normalizedScoutWallet = normalizeStellarAddress(scoutWallet);
    const result = this.db
      .prepare('DELETE FROM watchlist WHERE scout_wallet = ?')
      .run(normalizedScoutWallet);
    return result.changes;
  }

  list(scoutWallet: string): WatchlistEntry[] {
    const normalizedScoutWallet = normalizeStellarAddress(scoutWallet);
    const rows = this.db
      .prepare(
        'SELECT * FROM watchlist WHERE scout_wallet = ? ORDER BY created_at DESC, id DESC',
      )
      .all(normalizedScoutWallet) as WatchlistRow[];
    return rows.map(rowToEntry);
  }

  /** Returns the number of entries owned by scoutWallet. */
  count(scoutWallet: string): number {
    const normalizedScoutWallet = normalizeStellarAddress(scoutWallet);
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM watchlist WHERE scout_wallet = ?')
      .get(normalizedScoutWallet) as { n: number };
    return row.n;
  }

  close(): void {
    this.db.close();
  }
}
