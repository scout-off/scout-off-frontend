/**
 * Lightweight migration runner shared by every lib/sqliteDb.ts-backed store.
 *
 * Each store now describes its schema as an ordered list of Migration
 * objects instead of a single `CREATE TABLE IF NOT EXISTS` block run
 * unconditionally on every open. Applied versions are tracked in a
 * `schema_version` table written to the same database file, so a store can
 * grow its schema (add a column, add a table) via a new migration without a
 * destructive drop-and-recreate and without re-running earlier migrations.
 *
 * Migration 1 for an existing store must reproduce that store's
 * already-shipped schema using `IF NOT EXISTS` DDL — that keeps opening an
 * existing production database a no-op (the table already exists, so the
 * statement matches and does nothing) while still recording that version 1
 * has been applied, so later migrations layer on top correctly.
 */
import type Database from 'better-sqlite3';

export interface Migration {
  /** Sequential, starting at 1. Applied in ascending order. */
  version: number;
  /** Short human-readable name, surfaced in errors and logs. */
  name: string;
  /** Runs inside a transaction; throw to abort and roll back. */
  up: (db: Database.Database) => void;
}

const SCHEMA_VERSION_TABLE = `
CREATE TABLE IF NOT EXISTS schema_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
)`;

function getCurrentVersion(db: Database.Database): number {
  db.exec(SCHEMA_VERSION_TABLE);
  const row = db
    .prepare('SELECT version FROM schema_version WHERE id = 1')
    .get() as { version: number } | undefined;
  return row?.version ?? 0;
}

function setVersion(db: Database.Database, version: number): void {
  db.prepare(
    `INSERT INTO schema_version (id, version) VALUES (1, @version)
     ON CONFLICT(id) DO UPDATE SET version = excluded.version`,
  ).run({ version });
}

/**
 * Applies every migration whose version is greater than the database's
 * current recorded version, in ascending order, each in its own
 * transaction. Safe to call on every process start — a fully up-to-date
 * database does nothing.
 */
export function applyMigrations(
  db: Database.Database,
  migrations: Migration[],
): void {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  const current = getCurrentVersion(db);
  const pending = sorted.filter((m) => m.version > current);

  for (const migration of pending) {
    const run = db.transaction(() => {
      migration.up(db);
      setVersion(db, migration.version);
    });
    run();
  }
}
