/**
 * Shared better-sqlite3 bootstrap for off-chain, per-scout stores (watchlist,
 * saved searches). Mirrors lib/adminAuditStore.ts's DB-open conventions
 * (WAL journal mode, `:memory:` in tests) without repeating that boilerplate
 * in every store.
 *
 * Schema is applied via lib/sqliteMigrations.ts's versioned migration
 * runner rather than an unconditional `CREATE TABLE IF NOT EXISTS` — pass
 * `migrations` and this function applies any not yet recorded in the
 * database's `schema_version` table. See sqliteMigrations.ts's doc comment
 * for how to add a migration to an existing store.
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { applyMigrations, type Migration } from './sqliteMigrations';

export function openSqliteDb(
  defaultFilename: string,
  envVar: string,
  migrations?: Migration[],
  explicitPath?: string,
): Database.Database {
  const dbPath =
    explicitPath ??
    process.env[envVar] ??
    (process.env.NODE_ENV === 'test'
      ? ':memory:'
      : path.join(process.cwd(), 'data', defaultFilename));

  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  if (migrations && migrations.length > 0) {
    applyMigrations(db, migrations);
  }

  return db;
}
