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
 *
 * NOTE (#1471): SQLite is the local/test adapter only. On serverless
 * deployments the filesystem is read-only outside `/tmp`, ephemeral, and not
 * shared between instances, so a local file loses or forks data. When
 * `DATABASE_URL` is set (production), stores must go through the shared
 * Postgres adapter in `lib/db/` instead of calling this function. This
 * function refuses to open a local file in production so a misconfigured
 * deployment fails loudly rather than silently writing to ephemeral disk.
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

  if (
    process.env.NODE_ENV === 'production' &&
    dbPath !== ':memory:' &&
    !process.env.DATABASE_URL
  ) {
    throw new Error(
      `Refusing to open local SQLite file "${dbPath}" in production without DATABASE_URL. ` +
        'Serverless filesystems are ephemeral and not shared between instances; ' +
        'configure DATABASE_URL so stores use the shared Postgres adapter (see lib/db/).',
    );
  }

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
