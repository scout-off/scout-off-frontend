/**
 * @jest-environment node
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type Database from 'better-sqlite3';
import { openSqliteDb } from '@/lib/sqliteDb';
import type { Migration } from '@/lib/sqliteMigrations';

const ENV_VAR = 'TEST_SQLITE_DB_PATH';

describe('openSqliteDb', () => {
  let tmpDir: string;
  const opened: Database.Database[] = [];

  function open(migrations?: Migration[]) {
    const db = openSqliteDb('test.db', ENV_VAR, migrations);
    opened.push(db);
    return db;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-db-test-'));
    delete process.env[ENV_VAR];
  });

  afterEach(() => {
    opened.splice(0).forEach((db) => db.open && db.close());
    delete process.env[ENV_VAR];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses :memory: under NODE_ENV=test when the env var is unset', () => {
    const db = open();
    expect(db.memory).toBe(true);
    expect(db.name).toBe(':memory:');
  });

  it('uses the env var path when set and creates its parent directory', () => {
    const dbPath = path.join(tmpDir, 'nested', 'dir', 'store.db');
    process.env[ENV_VAR] = dbPath;
    const db = open();
    expect(db.name).toBe(dbPath);
    expect(fs.existsSync(path.dirname(dbPath))).toBe(true);
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('enables WAL journal mode for file databases', () => {
    process.env[ENV_VAR] = path.join(tmpDir, 'wal.db');
    const db = open();
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  it('applies the given migrations exactly once', () => {
    process.env[ENV_VAR] = path.join(tmpDir, 'migrated.db');
    const up = jest.fn((db: Database.Database) => {
      db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY)');
    });
    const migrations: Migration[] = [{ version: 1, name: 'create items', up }];

    open(migrations).close();
    const db = open(migrations);

    expect(up).toHaveBeenCalledTimes(1);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='items'",
        )
        .get(),
    ).toEqual({ name: 'items' });
  });
});
