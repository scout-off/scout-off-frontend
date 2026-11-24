import type { Migration } from '../sqliteMigrations';

/**
 * Migration 1 for the reconciliation-run history store (issue #1188), a
 * brand-new store — unlike admin-audit's migration 1, there's no
 * already-shipped schema to reproduce, so this is a genuinely fresh table.
 */
export const reconciliationHistoryMigrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS reconciliation_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          checked_at INTEGER NOT NULL,
          mismatch_count INTEGER NOT NULL,
          new_mismatch_count INTEGER NOT NULL,
          mismatches TEXT NOT NULL,
          skipped TEXT NOT NULL,
          inserted_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_checked_at ON reconciliation_runs(checked_at DESC);
      `);
    },
  },
];
