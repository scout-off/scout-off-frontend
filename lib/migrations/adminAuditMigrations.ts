import type { Migration } from '../sqliteMigrations';

/**
 * Migration 1 reproduces admin_audit_log's already-shipped schema with
 * `IF NOT EXISTS` DDL, so opening an existing production database applies
 * zero destructive changes — it just records that version 1 is present.
 */
export const adminAuditMigrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS admin_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action_type TEXT NOT NULL,
          admin_wallet TEXT NOT NULL,
          target TEXT,
          amount_stroops INTEGER,
          tx_hash TEXT,
          status TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          data TEXT NOT NULL,
          inserted_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_admin_audit_action_ts ON admin_audit_log(action_type, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_admin_audit_ts ON admin_audit_log(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_admin_audit_tx_hash ON admin_audit_log(tx_hash);
      `);
    },
  },
];
