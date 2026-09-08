import Database from 'better-sqlite3';
import { applyMigrations, type Migration } from '@/lib/sqliteMigrations';

describe('sqliteMigrations', () => {
  it('applies migrations in order and records the resulting version', () => {
    const db = new Database(':memory:');
    const migrations: Migration[] = [
      {
        version: 1,
        name: 'initial_schema',
        up: (d) => {
          d.exec(
            `CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`,
          );
        },
      },
      {
        version: 2,
        name: 'add_color',
        up: (d) => {
          d.exec(`ALTER TABLE widgets ADD COLUMN color TEXT`);
        },
      },
    ];

    applyMigrations(db, migrations);

    const version = db
      .prepare('SELECT version FROM schema_version WHERE id = 1')
      .get() as { version: number };
    expect(version.version).toBe(2);

    const columns = db.pragma('table_info(widgets)') as Array<{ name: string }>;
    expect(columns.map((c) => c.name)).toEqual(['id', 'name', 'color']);

    db.close();
  });

  it('adds a new column to a pre-populated database without losing existing data', () => {
    // Simulate a production database that already has version-1 rows,
    // seeded BEFORE the migration runner or schema_version table existed.
    const db = new Database(':memory:');
    db.exec(
      `CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`,
    );
    db.prepare('INSERT INTO widgets (id, name) VALUES (1, ?)').run('sprocket');
    db.prepare('INSERT INTO widgets (id, name) VALUES (2, ?)').run('gadget');

    const migrations: Migration[] = [
      {
        version: 1,
        name: 'initial_schema',
        up: (d) => {
          // IF NOT EXISTS: matches the already-shipped table, so this is a no-op.
          d.exec(
            `CREATE TABLE IF NOT EXISTS widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`,
          );
        },
      },
      {
        version: 2,
        name: 'add_color',
        up: (d) => {
          d.exec(`ALTER TABLE widgets ADD COLUMN color TEXT`);
        },
      },
    ];

    applyMigrations(db, migrations);

    const rows = db
      .prepare('SELECT id, name, color FROM widgets ORDER BY id')
      .all() as Array<{ id: number; name: string; color: string | null }>;
    expect(rows).toEqual([
      { id: 1, name: 'sprocket', color: null },
      { id: 2, name: 'gadget', color: null },
    ]);

    db.close();
  });

  it('does not re-apply already-applied migrations', () => {
    const db = new Database(':memory:');
    let runCount = 0;
    const migrations: Migration[] = [
      {
        version: 1,
        name: 'initial_schema',
        up: (d) => {
          runCount++;
          d.exec(`CREATE TABLE IF NOT EXISTS widgets (id INTEGER PRIMARY KEY)`);
        },
      },
    ];

    applyMigrations(db, migrations);
    applyMigrations(db, migrations);

    expect(runCount).toBe(1);
    db.close();
  });

  it('applies only newly added migrations on a second call', () => {
    const db = new Database(':memory:');
    const v1: Migration[] = [
      {
        version: 1,
        name: 'initial_schema',
        up: (d) => d.exec(`CREATE TABLE widgets (id INTEGER PRIMARY KEY)`),
      },
    ];
    applyMigrations(db, v1);

    const v1AndV2: Migration[] = [
      ...v1,
      {
        version: 2,
        name: 'add_color',
        up: (d) => d.exec(`ALTER TABLE widgets ADD COLUMN color TEXT`),
      },
    ];
    applyMigrations(db, v1AndV2);

    const version = db
      .prepare('SELECT version FROM schema_version WHERE id = 1')
      .get() as { version: number };
    expect(version.version).toBe(2);

    db.close();
  });

  it('rolls back a failing migration and does not record its version', () => {
    const db = new Database(':memory:');
    db.exec(
      `CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`,
    );
    db.prepare('INSERT INTO widgets (id, name) VALUES (1, ?)').run('sprocket');

    const migrations: Migration[] = [
      {
        version: 1,
        name: 'broken',
        up: (d) => {
          d.exec(`INSERT INTO widgets (id, name) VALUES (2, 'gadget')`);
          throw new Error('boom');
        },
      },
    ];

    expect(() => applyMigrations(db, migrations)).toThrow('boom');

    const rows = db.prepare('SELECT id FROM widgets ORDER BY id').all();
    expect(rows).toEqual([{ id: 1 }]);

    const versionRow = db
      .prepare('SELECT version FROM schema_version WHERE id = 1')
      .get();
    expect(versionRow).toBeUndefined();

    db.close();
  });
});
