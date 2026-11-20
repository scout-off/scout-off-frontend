import type { Migration } from '../sqliteMigrations';

export const savedSearchAlertMigrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS saved_search_alert (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scout_wallet TEXT NOT NULL,
          search_id INTEGER NOT NULL,
          search_name TEXT NOT NULL,
          player_id TEXT NOT NULL,
          event_id INTEGER NOT NULL,
          filter TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          delivered_at INTEGER,
          digest INTEGER NOT NULL DEFAULT 0,
          UNIQUE (scout_wallet, search_id, player_id)
        );
        CREATE INDEX IF NOT EXISTS idx_saved_search_alert_wallet
          ON saved_search_alert(scout_wallet);
        CREATE TABLE IF NOT EXISTS saved_search_alert_cursor (
          name TEXT PRIMARY KEY,
          value INTEGER NOT NULL
        );
      `);
    },
  },
];
