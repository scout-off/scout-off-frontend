/**
 * notificationReadStore — SQLite-backed persistence for per-wallet
 * notification read state (issue #557's "read/unread status persists
 * across sessions"). Mirrors lib/watchlistStore.ts's conventions: one
 * table, idempotent `CREATE TABLE IF NOT EXISTS` DDL run on construction,
 * a process-wide singleton, DB bootstrap shared via lib/sqliteDb.ts.
 *
 * Notification *content* is derived on the fly from indexer events (see
 * lib/notifications.ts) rather than stored here — this table only tracks
 * which of those event-derived notification ids a wallet has read.
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notification_reads (
  wallet TEXT NOT NULL,
  notification_id INTEGER NOT NULL,
  read_at INTEGER NOT NULL,
  PRIMARY KEY (wallet, notification_id)
);
`;

export class NotificationReadStore {
  private static _instance: NotificationReadStore | null = null;

  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(SCHEMA);
  }

  static getInstance(): NotificationReadStore {
    if (!NotificationReadStore._instance) {
      NotificationReadStore._instance = new NotificationReadStore(
        openSqliteDb('notification-reads.db', 'NOTIFICATION_READS_DB_PATH'),
      );
    }
    return NotificationReadStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (NotificationReadStore._instance) {
      NotificationReadStore._instance.db.close();
    }
    NotificationReadStore._instance = null;
  }

  getReadIds(wallet: string): number[] {
    const rows = this.db
      .prepare(
        'SELECT notification_id FROM notification_reads WHERE wallet = ?',
      )
      .all(wallet) as { notification_id: number }[];
    return rows.map((r) => r.notification_id);
  }

  markRead(wallet: string, notificationIds: number[]): void {
    if (notificationIds.length === 0) return;
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO notification_reads (wallet, notification_id, read_at)
       VALUES (@wallet, @notification_id, @read_at)`,
    );
    const insertMany = this.db.transaction((ids: number[]) => {
      for (const id of ids) {
        insert.run({ wallet, notification_id: id, read_at: Date.now() });
      }
    });
    insertMany(notificationIds);
  }

  /** Deletes every read-state row for wallet. Returns the number of rows removed. */
  clearForWallet(wallet: string): number {
    const result = this.db
      .prepare('DELETE FROM notification_reads WHERE wallet = ?')
      .run(wallet);
    return result.changes;
  }

  /**
   * Data-retention pruning (issue #1477).
   *
   * Deletes read-state rows older than `beforeMs` (absolute epoch-ms
   * cutoff).  A wallet that hasn't acted on a notification in that window
   * will simply see those items as unread again — an acceptable tradeoff
   * for bounded storage. Returns the number of rows deleted.
   */
  pruneOlderThan(beforeMs: number): number {
    const result = this.db
      .prepare('DELETE FROM notification_reads WHERE read_at < ?')
      .run(beforeMs);
    return result.changes;
  }
}
