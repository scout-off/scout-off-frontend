/**
 * savedSearchStore — SQLite-backed persistence for scouts' saved player
 * searches. Mirrors lib/adminAuditStore.ts's conventions: a process-wide
 * singleton, DB bootstrap and schema shared via lib/sqliteDb.ts's
 * openSqliteDb, with schema applied through lib/sqliteMigrations.ts's
 * versioned migration runner (see lib/migrations/savedSearchMigrations.ts).
 * `filter` is stored as a JSON column, same pattern as adminAuditStore's
 * `data` field.
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';
import { savedSearchMigrations } from './migrations/savedSearchMigrations';
import type { PlayerFilter, SavedSearch } from '@/types';

interface SavedSearchRow {
  id: number;
  scout_wallet: string;
  name: string;
  filter: string;
  created_at: number;
  last_viewed_at: number;
}

function rowToEntry(row: SavedSearchRow): SavedSearch {
  return {
    id: row.id,
    scoutWallet: row.scout_wallet,
    name: row.name,
    filter: JSON.parse(row.filter),
    createdAt: row.created_at,
    lastViewedAt: row.last_viewed_at,
  };
}

export class SavedSearchStore {
  private static _instance: SavedSearchStore | null = null;

  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static getInstance(): SavedSearchStore {
    if (!SavedSearchStore._instance) {
      SavedSearchStore._instance = new SavedSearchStore(
        openSqliteDb(
          'saved-search.db',
          'SAVED_SEARCH_DB_PATH',
          savedSearchMigrations,
        ),
      );
    }
    return SavedSearchStore._instance;
  }

  rename(scoutWallet: string, id: number, newName: string): SavedSearch | null {
    const result = this.db
      .prepare(
        'UPDATE saved_search SET name = ? WHERE id = ? AND scout_wallet = ?',
      )
      .run(newName, id, scoutWallet);
    if (result.changes === 0) return null;

    const row = this.db
      .prepare('SELECT * FROM saved_search WHERE id = ?')
      .get(id) as SavedSearchRow;
    return rowToEntry(row);
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (SavedSearchStore._instance) {
      SavedSearchStore._instance.db.close();
    }
    SavedSearchStore._instance = null;
  }

  add(scoutWallet: string, name: string, filter: PlayerFilter): SavedSearch {
    const now = Date.now();
    const result = this.db
      .prepare(
        `INSERT INTO saved_search (scout_wallet, name, filter, created_at, last_viewed_at)
         VALUES (@scout_wallet, @name, @filter, @created_at, @last_viewed_at)`,
      )
      .run({
        scout_wallet: scoutWallet,
        name,
        filter: JSON.stringify(filter),
        created_at: now,
        last_viewed_at: now,
      });

    const row = this.db
      .prepare('SELECT * FROM saved_search WHERE id = ?')
      .get(result.lastInsertRowid) as SavedSearchRow;
    return rowToEntry(row);
  }

  /**
   * Marks a saved search as viewed now, scoped to its owner. Called when the
   * scout opens/applies a saved search, so the "new since last viewed" count
   * resets against the current result set.
   */
  markViewed(scoutWallet: string, id: number): SavedSearch | null {
    const result = this.db
      .prepare(
        'UPDATE saved_search SET last_viewed_at = ? WHERE id = ? AND scout_wallet = ?',
      )
      .run(Date.now(), id, scoutWallet);
    if (result.changes === 0) return null;

    const row = this.db
      .prepare('SELECT * FROM saved_search WHERE id = ?')
      .get(id) as SavedSearchRow;
    return rowToEntry(row);
  }

  /** Deletes an entry scoped to its owner. Returns false if not found or not owned by scoutWallet. */
  remove(scoutWallet: string, id: number): boolean {
    const result = this.db
      .prepare('DELETE FROM saved_search WHERE id = ? AND scout_wallet = ?')
      .run(id, scoutWallet);
    return result.changes > 0;
  }

  /** Deletes every entry owned by scoutWallet. Returns the number of rows removed. */
  clearForWallet(scoutWallet: string): number {
    const result = this.db
      .prepare('DELETE FROM saved_search WHERE scout_wallet = ?')
      .run(scoutWallet);
    return result.changes;
  }

  list(scoutWallet: string): SavedSearch[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM saved_search WHERE scout_wallet = ? ORDER BY created_at DESC, id DESC',
      )
      .all(scoutWallet) as SavedSearchRow[];
    return rows.map(rowToEntry);
  }

  close(): void {
    this.db.close();
  }
}
