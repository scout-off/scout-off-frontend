import type { Migration } from '../sqliteMigrations';

/**
 * Migration 1 for the milestone-endorsement store (issue #1185) — a
 * brand-new table, so there's no already-shipped schema to reproduce.
 */
export const milestoneEndorsementMigrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS milestone_endorsements (
          player_id TEXT NOT NULL,
          milestone_id TEXT NOT NULL,
          wallet TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (player_id, milestone_id, wallet)
        );
        CREATE INDEX IF NOT EXISTS idx_milestone_endorsements_lookup
          ON milestone_endorsements(player_id, milestone_id);
      `);
    },
  },
];
