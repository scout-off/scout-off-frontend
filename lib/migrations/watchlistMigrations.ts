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
  {
    // Issue #1716: additive, nullable columns for scouts' private notes and
    // tags. Existing rows keep NULLs, which read back as an empty note/tags.
    version: 2,
    name: 'notes_and_tags',
    up: (db) => {
      db.exec(`
        ALTER TABLE watchlist ADD COLUMN note TEXT;
        ALTER TABLE watchlist ADD COLUMN tags TEXT;
        ALTER TABLE watchlist ADD COLUMN updated_at INTEGER;
      `);
    },
  },
];
