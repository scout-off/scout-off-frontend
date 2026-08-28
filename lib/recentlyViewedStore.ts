/**
 * recentlyViewedStore — SQLite-backed persistence for scouts' recently-viewed
 * players. Mirrors lib/watchlistStore.ts's conventions: a process-wide
 * singleton, DB bootstrap and schema shared via lib/sqliteDb.ts's
 * openSqliteDb, with schema applied through lib/sqliteMigrations.ts's
 * versioned migration runner (see lib/migrations/recentlyViewedMigrations.ts).
 * Entries are capped at MAX_ENTRIES per scout (50) to avoid unbounded storage.
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';
import { recentlyViewedMigrations } from './migrations/recentlyViewedMigrations';
import type { RecentlyViewedEntry } from './useRecentlyViewed';

interface RecentlyViewedRow {
  id: number;
  scout_wallet: string;
  player_id: string;
  viewed_at: number;
}

function rowToEntry(row: RecentlyViewedRow): RecentlyViewedEntry {
  return {
    id: row.id,
    playerId: row.player_id,
    name: '', // Not stored in DB
    position: '', // Not stored in DB
    viewedAt: row.viewed_at,
  };
}

const MAX_ENTRIES = 50;

export { MAX_ENTRIES };

export class RecentlyViewedStore {
  private static _instance: RecentlyViewedStore | null = null;

  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static getInstance(): RecentlyViewedStore {
    if (!RecentlyViewedStore._instance) {
      RecentlyViewedStore._instance = new RecentlyViewedStore(
        openSqliteDb(
          'recently-viewed.db',
          'RECENTLY_VIEWED_DB_PATH',
          recentlyViewedMigrations,
        ),
      );
    }
    return RecentlyViewedStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (RecentlyViewedStore._instance) {
      RecentlyViewedStore._instance.db.close();
    }
    RecentlyViewedStore._instance = null;
  }

  /**
   * Records a player view, maintaining deduplication and max capacity.
   * Returns the stored entry.
   */
  record(
    scoutWallet: string,
    playerId: string,
    viewedAt: number,
  ): RecentlyViewedEntry {
    // First, remove any existing entry for this player
    this.remove(scoutWallet, playerId);

    // Insert new entry
    const result = this.db
      .prepare(
        `INSERT INTO recently_viewed (scout_wallet, player_id, viewed_at)
         VALUES (@scout_wallet, @player_id, @viewed_at)`,
      )
      .run({
        scout_wallet: scoutWallet,
        player_id: playerId,
        viewed_at: viewedAt,
      });

    // Cap entries at MAX_ENTRIES by removing oldest
    this.trimToMaxEntries(scoutWallet);

    const row = this.db
      .prepare(
        'SELECT * FROM recently_viewed WHERE scout_wallet = ? AND player_id = ?',
      )
      .get(scoutWallet, playerId) as RecentlyViewedRow;
    return rowToEntry(row);
  }

  /**
   * Removes a specific player view entry. Returns true if found and removed.
   */
  removeByPlayerId(scoutWallet: string, playerId: string): boolean {
    const result = this.db
      .prepare(
        'DELETE FROM recently_viewed WHERE scout_wallet = ? AND player_id = ?',
      )
      .run(scoutWallet, playerId);
    return result.changes > 0;
  }

  /**
   * Removes an entry by database id. Returns true if found and removed.
   */
  remove(scoutWallet: string, id: number): boolean {
    const result = this.db
      .prepare('DELETE FROM recently_viewed WHERE id = ? AND scout_wallet = ?')
      .run(id, scoutWallet);
    return result.changes > 0;
  }

  /**
   * Clears all recently viewed entries for a scout wallet.
   * Returns the number of entries removed.
   */
  clearForWallet(scoutWallet: string): number {
    const result = this.db
      .prepare('DELETE FROM recently_viewed WHERE scout_wallet = ?')
      .run(scoutWallet);
    return result.changes;
  }

  /**
   * Returns all recently viewed entries for a scout wallet, ordered by
   * most recent first.
   */
  list(scoutWallet: string): RecentlyViewedEntry[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM recently_viewed WHERE scout_wallet = ? ORDER BY viewed_at DESC, id DESC',
      )
      .all(scoutWallet) as RecentlyViewedRow[];
    return rows.map(rowToEntry);
  }

  /**
   * Caps the number of entries for a scout wallet to MAX_ENTRIES by
   * removing the oldest entries.
   */
  private trimToMaxEntries(scoutWallet: string): void {
    const allEntries = this.db
      .prepare(
        'SELECT id FROM recently_viewed WHERE scout_wallet = ? ORDER BY viewed_at DESC, id DESC',
      )
      .all(scoutWallet) as Array<{ id: number }>;

    if (allEntries.length > MAX_ENTRIES) {
      const idsToRemove = allEntries.slice(MAX_ENTRIES).map((e) => e.id);
      const placeholders = idsToRemove.map(() => '?').join(', ');
      this.db
        .prepare(`DELETE FROM recently_viewed WHERE id IN (${placeholders})`)
        .run(...idsToRemove);
    }
  }

  close(): void {
    this.db.close();
  }
}