import type { Migration } from '../sqliteMigrations';

/**
 * Migration 1 creates the recently_viewed table for per-scout server-side
 * persistence. Mirrors watchlistMigrations pattern: IF NOT EXISTS ensures
 * safe deployment to existing production databases.
 */
export const recentlyViewedMigrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS recently_viewed (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scout_wallet TEXT NOT NULL,
          player_id TEXT NOT NULL,
          viewed_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_recently_viewed_scout_wallet ON recently_viewed(scout_wallet);
        CREATE INDEX IF NOT EXISTS idx_recently_viewed_viewed_at ON recently_viewed(viewed_at);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_recently_viewed_scout_player ON recently_viewed(scout_wallet, player_id);
      `);
    },
  },
];