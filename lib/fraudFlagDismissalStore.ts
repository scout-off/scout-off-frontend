/**
 * fraudFlagDismissalStore — SQLite-backed persistence for admin decisions on
 * fraud flags (issue #1171). See docs/fraud-detection.md: the heuristics in
 * `lib/fraudDetection.ts` are pure functions recomputed from scratch on
 * every panel load / cron run — there is no stored "flag row" with a
 * database id to mark reviewed. This store closes that gap by persisting
 * dismissals keyed on `computeFraudFlagDismissalKey` (lib/fraudDetection.ts:
 * category + heuristic + severity + sorted subject wallets), so "the same
 * flag" is identified by its content rather than an id that doesn't exist
 * for a freshly-computed flag.
 *
 * A dismissal only ever suppresses an exact key match. If the same
 * wallet/pattern later crosses into a different or higher-severity
 * heuristic result, that's a different key — never suppressed by an older
 * dismissal of the milder finding. See computeFraudFlagDismissalKey's doc
 * comment for why severity is folded into the key.
 *
 * Every dismissal is also written to lib/adminAuditStore.ts (see
 * `app/api/admin/fraud-flags/dismiss/route.ts`) so who dismissed what, when,
 * and why is captured in the same cross-action audit trail as every other
 * admin action, rather than a separate untracked mechanism — this table
 * alone is the fast, key-indexed lookup the panel filter needs on every
 * load, not a competing audit record.
 *
 * Mirrors lib/fraudThrottleStore.ts's conventions: one table, idempotent
 * `CREATE TABLE IF NOT EXISTS` DDL, process-wide singleton, DB bootstrap
 * shared via lib/sqliteDb.ts.
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';
import type {
  FraudFlagCategory,
  FraudFlagDismissal,
  FraudFlagSeverity,
} from '@/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fraud_flag_dismissals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flag_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  heuristic TEXT NOT NULL,
  severity TEXT NOT NULL,
  wallets TEXT NOT NULL,
  flag_reason TEXT NOT NULL,
  note TEXT,
  dismissed_by TEXT NOT NULL,
  dismissed_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fraud_flag_dismissals_flag_key ON fraud_flag_dismissals(flag_key);
CREATE INDEX IF NOT EXISTS idx_fraud_flag_dismissals_dismissed_at ON fraud_flag_dismissals(dismissed_at DESC);
`;

export interface NewFraudFlagDismissal {
  flagKey: string;
  category: FraudFlagCategory;
  heuristic: string;
  severity: FraudFlagSeverity;
  wallets: string[];
  flagReason: string;
  note?: string | null;
  dismissedBy: string;
  dismissedAt?: number;
}

interface FraudFlagDismissalRow {
  id: number;
  flag_key: string;
  category: string;
  heuristic: string;
  severity: string;
  wallets: string;
  flag_reason: string;
  note: string | null;
  dismissed_by: string;
  dismissed_at: number;
}

function rowToDismissal(row: FraudFlagDismissalRow): FraudFlagDismissal {
  return {
    id: row.id,
    flagKey: row.flag_key,
    category: row.category as FraudFlagCategory,
    heuristic: row.heuristic,
    severity: row.severity as FraudFlagSeverity,
    wallets: JSON.parse(row.wallets),
    flagReason: row.flag_reason,
    note: row.note,
    dismissedBy: row.dismissed_by,
    dismissedAt: row.dismissed_at,
  };
}

export class FraudFlagDismissalStore {
  private static _instance: FraudFlagDismissalStore | null = null;

  private db: Database.Database;

  private constructor() {
    this.db = openSqliteDb(
      'fraud-flag-dismissals.db',
      'FRAUD_FLAG_DISMISSALS_DB_PATH',
    );
    this.db.exec(SCHEMA);
  }

  static getInstance(): FraudFlagDismissalStore {
    if (!FraudFlagDismissalStore._instance) {
      FraudFlagDismissalStore._instance = new FraudFlagDismissalStore();
    }
    return FraudFlagDismissalStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (FraudFlagDismissalStore._instance) {
      FraudFlagDismissalStore._instance.db.close();
    }
    FraudFlagDismissalStore._instance = null;
  }

  /**
   * Records a dismissal for `entry.flagKey`. Upserts on the key: a repeat
   * dismissal of the same still-open key (e.g. an admin revising their
   * note) updates the existing row in place rather than accumulating
   * duplicate history — unlike fraud_throttles, there's no "undismiss"
   * state transition to preserve a history of here yet, so one row per key
   * is all this needs to track.
   */
  dismiss(entry: NewFraudFlagDismissal): FraudFlagDismissal {
    const dismissedAt = entry.dismissedAt ?? Date.now();
    const params = {
      flag_key: entry.flagKey,
      category: entry.category,
      heuristic: entry.heuristic,
      severity: entry.severity,
      wallets: JSON.stringify(entry.wallets),
      flag_reason: entry.flagReason,
      note: entry.note ?? null,
      dismissed_by: entry.dismissedBy,
      dismissed_at: dismissedAt,
    };

    this.db
      .prepare(
        `INSERT INTO fraud_flag_dismissals
           (flag_key, category, heuristic, severity, wallets, flag_reason, note, dismissed_by, dismissed_at)
         VALUES (@flag_key, @category, @heuristic, @severity, @wallets, @flag_reason, @note, @dismissed_by, @dismissed_at)
         ON CONFLICT(flag_key) DO UPDATE SET
           category = excluded.category,
           heuristic = excluded.heuristic,
           severity = excluded.severity,
           wallets = excluded.wallets,
           flag_reason = excluded.flag_reason,
           note = excluded.note,
           dismissed_by = excluded.dismissed_by,
           dismissed_at = excluded.dismissed_at`,
      )
      .run(params);

    const row = this.db
      .prepare('SELECT * FROM fraud_flag_dismissals WHERE flag_key = ?')
      .get(entry.flagKey) as FraudFlagDismissalRow;
    return rowToDismissal(row);
  }

  isDismissed(flagKey: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM fraud_flag_dismissals WHERE flag_key = ?')
      .get(flagKey);
    return row !== undefined;
  }

  /**
   * Every currently-dismissed key, for filtering a freshly-computed flag
   * list in one query rather than one `isDismissed` lookup per flag.
   */
  getDismissedKeys(): Set<string> {
    const rows = this.db
      .prepare('SELECT flag_key FROM fraud_flag_dismissals')
      .all() as { flag_key: string }[];
    return new Set(rows.map((r) => r.flag_key));
  }

  /** Full dismissal history, most recently dismissed first. */
  listAll(limit = 200): FraudFlagDismissal[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM fraud_flag_dismissals ORDER BY dismissed_at DESC LIMIT ?',
      )
      .all(limit) as FraudFlagDismissalRow[];
    return rows.map(rowToDismissal);
  }

  close(): void {
    this.db.close();
  }
}
