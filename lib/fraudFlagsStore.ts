/**
 * fraudFlagsStore — SQLite-backed persistence for fraud-flag evaluation
 * runs (issue #1007). Every run of `runFraudFlagEvaluation` (lib/fraudFlagsRunner.ts),
 * whether triggered by an admin loading FraudFlagsPanel.tsx or by the
 * scheduled cron trigger (app/api/cron/fraud-flags/route.ts), is recorded
 * here with a timestamp so the panel can show "as of [time]" and flag a
 * stale result instead of only ever showing "as of right now."
 *
 * Mirrors lib/adminAuditStore.ts's conventions: one table, idempotent
 * `CREATE TABLE IF NOT EXISTS` DDL, process-wide singleton, DB bootstrap
 * shared via lib/sqliteDb.ts. See docs/fraud-detection.md for the scheduling
 * investigation this store supports.
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';
import type { FraudFlag } from '@/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fraud_flag_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluated_at INTEGER NOT NULL,
  trigger TEXT NOT NULL,
  flags TEXT NOT NULL,
  warnings TEXT NOT NULL,
  high_severity_count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fraud_flag_runs_evaluated_at ON fraud_flag_runs(evaluated_at DESC);
`;

export type FraudFlagRunTrigger = 'manual' | 'cron';

export interface FraudFlagRun {
  id: number;
  evaluatedAt: number;
  trigger: FraudFlagRunTrigger;
  flags: FraudFlag[];
  warnings: string[];
  highSeverityCount: number;
}

interface FraudFlagRunRow {
  id: number;
  evaluated_at: number;
  trigger: string;
  flags: string;
  warnings: string;
  high_severity_count: number;
}

function rowToRun(row: FraudFlagRunRow): FraudFlagRun {
  return {
    id: row.id,
    evaluatedAt: row.evaluated_at,
    trigger: row.trigger as FraudFlagRunTrigger,
    flags: JSON.parse(row.flags),
    warnings: JSON.parse(row.warnings),
    highSeverityCount: row.high_severity_count,
  };
}

export class FraudFlagsStore {
  private static _instance: FraudFlagsStore | null = null;

  private db: Database.Database;

  private constructor() {
    this.db = openSqliteDb('fraud-flags.db', 'FRAUD_FLAGS_DB_PATH');
    this.db.exec(SCHEMA);
  }

  static getInstance(): FraudFlagsStore {
    if (!FraudFlagsStore._instance) {
      FraudFlagsStore._instance = new FraudFlagsStore();
    }
    return FraudFlagsStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (FraudFlagsStore._instance) {
      FraudFlagsStore._instance.db.close();
    }
    FraudFlagsStore._instance = null;
  }

  recordRun(
    trigger: FraudFlagRunTrigger,
    flags: FraudFlag[],
    warnings: string[],
    evaluatedAt: number = Date.now(),
  ): FraudFlagRun {
    const highSeverityCount = flags.filter((f) => f.severity === 'high').length;
    const result = this.db
      .prepare(
        `INSERT INTO fraud_flag_runs
           (evaluated_at, trigger, flags, warnings, high_severity_count)
         VALUES (@evaluated_at, @trigger, @flags, @warnings, @high_severity_count)`,
      )
      .run({
        evaluated_at: evaluatedAt,
        trigger,
        flags: JSON.stringify(flags),
        warnings: JSON.stringify(warnings),
        high_severity_count: highSeverityCount,
      });

    const row = this.db
      .prepare('SELECT * FROM fraud_flag_runs WHERE id = ?')
      .get(result.lastInsertRowid) as FraudFlagRunRow;
    return rowToRun(row);
  }

  /** Most recent run, regardless of what triggered it, or null if none exist yet. */
  getLatestRun(): FraudFlagRun | null {
    const row = this.db
      .prepare(
        'SELECT * FROM fraud_flag_runs ORDER BY evaluated_at DESC LIMIT 1',
      )
      .get() as FraudFlagRunRow | undefined;
    return row ? rowToRun(row) : null;
  }

  close(): void {
    this.db.close();
  }
}
