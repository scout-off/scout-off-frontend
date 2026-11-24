import type { Migration } from '../sqliteMigrations';

/**
 * Migration 1 reproduces watchlist's already-shipped schema with
 * `IF NOT EXISTS` DDL, so opening an existing production database applies
 * zero destructive changes — it just records that version 1 is present.
 */
export const watchlistMigrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS watchlist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scout_wallet TEXT NOT NULL,
          player_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(scout_wallet, player_id)
        );
        CREATE INDEX IF NOT EXISTS idx_watchlist_scout_wallet ON watchlist(scout_wallet);
      `);
    },
  },
];
