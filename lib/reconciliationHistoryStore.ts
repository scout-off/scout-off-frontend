/**
 * reconciliationHistoryStore — persists every admin-audit-log reconciliation
 * run's result (issue #1188), not just the latest one that
 * hooks/useAdminAuditLog.ts already held in memory. Without this, a
 * mismatch that appeared and was resolved between two admin sessions left
 * no trace, and there was no way to notice a pattern of recurring
 * mismatches over time.
 *
 * DB bootstrap and schema follow lib/adminAuditStore.ts's conventions:
 * shared bootstrap via lib/sqliteDb.ts's openSqliteDb, schema applied
 * through lib/sqliteMigrations.ts's versioned migration runner (see
 * lib/migrations/reconciliationHistoryMigrations.ts), process-wide
 * singleton.
 */
import Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';
import { applyMigrations } from './sqliteMigrations';
import { reconciliationHistoryMigrations } from './migrations/reconciliationHistoryMigrations';
import type { ReconciliationMismatch, ReconciliationRun } from './adminAudit';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface RunRow {
  id: number;
  checked_at: number;
  mismatch_count: number;
  new_mismatch_count: number;
  mismatches: string;
  skipped: string;
  inserted_at: number;
}

function rowToRun(row: RunRow): ReconciliationRun {
  return {
    id: row.id,
    checkedAt: row.checked_at,
    mismatches: JSON.parse(row.mismatches),
    newMismatchCount: row.new_mismatch_count,
    skipped: JSON.parse(row.skipped),
  };
}

/**
 * A stable identity for a mismatch, used to diff one run's mismatch set
 * against the immediately preceding run's — "is this the same drift we
 * already know about, or something new." actionType+kind+target is the
 * narrowest tuple that's actually unique per mismatch: two different targets
 * (e.g. two different validator addresses both missing an audit entry) must
 * count as two distinct mismatches, not one.
 */
export function mismatchKey(m: ReconciliationMismatch): string {
  return `${m.actionType}:${m.kind}:${m.target ?? ''}`;
}

export class ReconciliationHistoryStore {
  private static _instance: ReconciliationHistoryStore | null = null;

  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static getInstance(): ReconciliationHistoryStore {
    if (!ReconciliationHistoryStore._instance) {
      const db = openSqliteDb(
        'reconciliation-history.db',
        'RECONCILIATION_HISTORY_DB_PATH',
        reconciliationHistoryMigrations,
      );
      ReconciliationHistoryStore._instance = new ReconciliationHistoryStore(
        db,
      );
    }
    return ReconciliationHistoryStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (ReconciliationHistoryStore._instance) {
      ReconciliationHistoryStore._instance.db.close();
    }
    ReconciliationHistoryStore._instance = null;
  }

  /** Most recent run, or null if reconciliation has never run before. */
  getLatest(): ReconciliationRun | null {
    const row = this.db
      .prepare('SELECT * FROM reconciliation_runs ORDER BY id DESC LIMIT 1')
      .get() as RunRow | undefined;
    return row ? rowToRun(row) : null;
  }

  /**
   * Persists a new run. `newMismatchCount` is computed by the caller (the
   * reconcile route), which is what actually knows "the preceding run" at
   * the moment this insert happens.
   */
  insertRun(input: {
    checkedAt: number;
    mismatches: ReconciliationMismatch[];
    newMismatchCount: number;
    skipped: string[];
  }): ReconciliationRun {
    const result = this.db
      .prepare(
        `INSERT INTO reconciliation_runs
           (checked_at, mismatch_count, new_mismatch_count, mismatches, skipped, inserted_at)
         VALUES (@checked_at, @mismatch_count, @new_mismatch_count, @mismatches, @skipped, @inserted_at)`,
      )
      .run({
        checked_at: input.checkedAt,
        mismatch_count: input.mismatches.length,
        new_mismatch_count: input.newMismatchCount,
        mismatches: JSON.stringify(input.mismatches),
        skipped: JSON.stringify(input.skipped),
        inserted_at: Date.now(),
      });

    const row = this.db
      .prepare('SELECT * FROM reconciliation_runs WHERE id = ?')
      .get(result.lastInsertRowid) as RunRow;
    return rowToRun(row);
  }

  /** Most recent runs, newest first, for the history view. */
  listRuns(limit = DEFAULT_LIMIT): ReconciliationRun[] {
    const cappedLimit = Math.min(limit, MAX_LIMIT);
    const rows = this.db
      .prepare('SELECT * FROM reconciliation_runs ORDER BY id DESC LIMIT ?')
      .all(cappedLimit) as RunRow[];
    return rows.map(rowToRun);
  }

  close(): void {
    this.db.close();
  }
}
