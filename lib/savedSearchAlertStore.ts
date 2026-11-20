/**
 * savedSearchAlertStore — SQLite-backed record of "a new player matches one
 * of your saved searches" alerts (issue #1705).
 *
 * - UNIQUE(scout_wallet, search_id, player_id) guarantees a scout is never
 *   alerted twice about the same player for the same search, however many
 *   times the cron re-reads an event.
 * - `delivered_at` is null until a delivery channel hands the alert to the
 *   scout: immediately for "instant" scouts, once a day for "daily digest"
 *   scouts (`digest = 1`, grouped by `delivered_at`).
 * - saved_search_alert_cursor stores the last indexer event id processed so
 *   the cron resumes where it left off.
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';
import { savedSearchAlertMigrations } from './migrations/savedSearchAlertMigrations';
import type { PlayerFilter } from '@/types';

const EVENT_CURSOR = 'events';

interface AlertRow {
  id: number;
  scout_wallet: string;
  search_id: number;
  search_name: string;
  player_id: string;
  event_id: number;
  filter: string;
  created_at: number;
  delivered_at: number | null;
  digest: number;
}

export interface SavedSearchAlert {
  id: number;
  scoutWallet: string;
  searchId: number;
  searchName: string;
  playerId: string;
  eventId: number;
  filter: PlayerFilter;
  /** Unix seconds — when the match was recorded. */
  createdAt: number;
  /** Unix seconds — when it was delivered to the scout; null while pending. */
  deliveredAt: number | null;
  /** Delivered as part of a daily digest rather than individually. */
  digest: boolean;
}

export type NewSavedSearchAlert = Pick<
  SavedSearchAlert,
  'scoutWallet' | 'searchId' | 'searchName' | 'playerId' | 'eventId' | 'filter'
>;

function rowToAlert(row: AlertRow): SavedSearchAlert {
  return {
    id: row.id,
    scoutWallet: row.scout_wallet,
    searchId: row.search_id,
    searchName: row.search_name,
    playerId: row.player_id,
    eventId: row.event_id,
    filter: JSON.parse(row.filter),
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    digest: row.digest === 1,
  };
}

export class SavedSearchAlertStore {
  private static _instance: SavedSearchAlertStore | null = null;

  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static getInstance(): SavedSearchAlertStore {
    if (!SavedSearchAlertStore._instance) {
      SavedSearchAlertStore._instance = new SavedSearchAlertStore(
        openSqliteDb(
          'saved-search-alerts.db',
          'SAVED_SEARCH_ALERT_DB_PATH',
          savedSearchAlertMigrations,
        ),
      );
    }
    return SavedSearchAlertStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (SavedSearchAlertStore._instance) {
      SavedSearchAlertStore._instance.db.close();
    }
    SavedSearchAlertStore._instance = null;
  }

  /** Last indexer event id processed by the cron (0 before the first run). */
  getCursor(): number {
    const row = this.db
      .prepare('SELECT value FROM saved_search_alert_cursor WHERE name = ?')
      .get(EVENT_CURSOR) as { value: number } | undefined;
    return row?.value ?? 0;
  }

  setCursor(value: number): void {
    this.db
      .prepare(
        `INSERT INTO saved_search_alert_cursor (name, value) VALUES (?, ?)
         ON CONFLICT(name) DO UPDATE SET value = excluded.value`,
      )
      .run(EVENT_CURSOR, value);
  }

  /**
   * Records a match. Returns the stored alert, or null when this
   * (scout, search, player) was already alerted.
   */
  record(
    alert: NewSavedSearchAlert,
    nowSec = Math.floor(Date.now() / 1000),
  ): SavedSearchAlert | null {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO saved_search_alert
           (scout_wallet, search_id, search_name, player_id, event_id, filter, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        alert.scoutWallet,
        alert.searchId,
        alert.searchName,
        alert.playerId,
        alert.eventId,
        JSON.stringify(alert.filter),
        nowSec,
      );
    if (result.changes === 0) return null;
    const row = this.db
      .prepare('SELECT * FROM saved_search_alert WHERE id = ?')
      .get(result.lastInsertRowid) as AlertRow;
    return rowToAlert(row);
  }

  /** Undelivered alerts, oldest first, grouped by the caller per wallet. */
  listPending(): SavedSearchAlert[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM saved_search_alert WHERE delivered_at IS NULL ORDER BY id ASC',
      )
      .all() as AlertRow[];
    return rows.map(rowToAlert);
  }

  /** Unix seconds of this wallet's most recent digest delivery, or 0. */
  lastDigestAt(wallet: string): number {
    const row = this.db
      .prepare(
        'SELECT MAX(delivered_at) AS at FROM saved_search_alert WHERE scout_wallet = ? AND digest = 1',
      )
      .get(wallet) as { at: number | null };
    return row.at ?? 0;
  }

  markDelivered(
    ids: number[],
    digest: boolean,
    nowSec = Math.floor(Date.now() / 1000),
  ): void {
    if (ids.length === 0) return;
    const stmt = this.db.prepare(
      'UPDATE saved_search_alert SET delivered_at = ?, digest = ? WHERE id = ? AND delivered_at IS NULL',
    );
    this.db.transaction(() => {
      for (const id of ids) stmt.run(nowSec, digest ? 1 : 0, id);
    })();
  }

  /** Delivered alerts for one scout, newest first. */
  listDelivered(wallet: string, limit = 100): SavedSearchAlert[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM saved_search_alert
         WHERE scout_wallet = ? AND delivered_at IS NOT NULL
         ORDER BY delivered_at DESC, id DESC LIMIT ?`,
      )
      .all(wallet, limit) as AlertRow[];
    return rows.map(rowToAlert);
  }

  /** Every alert for one scout (data export). */
  listForWallet(wallet: string): SavedSearchAlert[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM saved_search_alert WHERE scout_wallet = ? ORDER BY id ASC',
      )
      .all(wallet) as AlertRow[];
    return rows.map(rowToAlert);
  }

  /** Deletes every alert for one scout (data deletion). */
  clearForWallet(wallet: string): number {
    return this.db
      .prepare('DELETE FROM saved_search_alert WHERE scout_wallet = ?')
      .run(wallet).changes;
  }
}
