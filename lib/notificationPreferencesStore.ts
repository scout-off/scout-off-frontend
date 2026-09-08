/**
 * notificationPreferencesStore — SQLite-backed persistence for per-wallet
 * notification category toggles (issue #560). One row per wallet; a
 * missing row means "all categories on" (the default), matching the
 * `getPreferences` fallback below rather than requiring a row-seeding step.
 *
 * Mirrors lib/watchlistStore.ts's conventions: idempotent
 * `CREATE TABLE IF NOT EXISTS` DDL run on construction, a process-wide
 * singleton, DB bootstrap shared via lib/sqliteDb.ts.
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './notificationPreferencesClient';
import type { NotificationPreferences } from '@/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notification_preferences (
  wallet TEXT PRIMARY KEY,
  milestone_approvals INTEGER NOT NULL DEFAULT 1,
  contact_unlocks INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
`;

interface PreferencesRow {
  wallet: string;
  milestone_approvals: number;
  contact_unlocks: number;
  updated_at: number;
}

function rowToPreferences(row: PreferencesRow): NotificationPreferences {
  return {
    milestoneApprovals: row.milestone_approvals === 1,
    contactUnlocks: row.contact_unlocks === 1,
  };
}

/**
 * Thrown by {@link NotificationPreferencesStore.setWithVersionCheck} when the
 * caller's `baseVersion` no longer matches the row's `updated_at` — i.e.
 * someone else (another tab, another device) already wrote to this wallet's
 * preferences since the caller last read them. Carries the row's current
 * value and version so the caller can surface a "changed elsewhere" message
 * instead of silently clobbering the other write. See issue #1178.
 */
export class PreferencesConflictError extends Error {
  readonly current: NotificationPreferences;
  readonly currentVersion: number;

  constructor(current: NotificationPreferences, currentVersion: number) {
    super('Notification preferences were changed elsewhere');
    this.name = 'PreferencesConflictError';
    this.current = current;
    this.currentVersion = currentVersion;
  }
}

export class NotificationPreferencesStore {
  private static _instance: NotificationPreferencesStore | null = null;

  private db: Database.Database;
  /**
   * Highest version handed out so far by this instance. Versions are
   * derived from `Date.now()` but forced strictly increasing via this
   * counter: two writes issued in the same millisecond (plausible under
   * back-to-back synchronous better-sqlite3 calls, e.g. two requests
   * racing to update the same wallet) must still get distinct versions —
   * otherwise a genuine conflict could go undetected because the stale
   * `baseVersion` would coincidentally still match.
   */
  private lastIssuedVersion = 0;

  private constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(SCHEMA);
  }

  private nextVersion(): number {
    const now = Date.now();
    this.lastIssuedVersion =
      now > this.lastIssuedVersion ? now : this.lastIssuedVersion + 1;
    return this.lastIssuedVersion;
  }

  static getInstance(): NotificationPreferencesStore {
    if (!NotificationPreferencesStore._instance) {
      NotificationPreferencesStore._instance = new NotificationPreferencesStore(
        openSqliteDb(
          'notification-preferences.db',
          'NOTIFICATION_PREFERENCES_DB_PATH',
        ),
      );
    }
    return NotificationPreferencesStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (NotificationPreferencesStore._instance) {
      NotificationPreferencesStore._instance.db.close();
    }
    NotificationPreferencesStore._instance = null;
  }

  get(wallet: string): NotificationPreferences {
    const row = this.getRow(wallet);
    return row
      ? rowToPreferences(row)
      : { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  /**
   * Like `get`, but also returns the row's `updated_at` so a caller can
   * capture it as a `baseVersion` for a later optimistic-concurrency write
   * via `setWithVersionCheck`. A wallet with no saved row yet is version `0`
   * — any real write will have a strictly greater `updated_at`.
   */
  getWithVersion(wallet: string): {
    preferences: NotificationPreferences;
    updatedAt: number;
  } {
    const row = this.getRow(wallet);
    return {
      preferences: row
        ? rowToPreferences(row)
        : { ...DEFAULT_NOTIFICATION_PREFERENCES },
      updatedAt: row ? row.updated_at : 0,
    };
  }

  private getRow(wallet: string): PreferencesRow | undefined {
    return this.db
      .prepare('SELECT * FROM notification_preferences WHERE wallet = ?')
      .get(wallet) as PreferencesRow | undefined;
  }

  set(
    wallet: string,
    preferences: NotificationPreferences,
  ): NotificationPreferences {
    return this.setWithVersionCheck(wallet, preferences).preferences;
  }

  /**
   * Writes `preferences` for `wallet`, optionally enforcing optimistic
   * concurrency: when `baseVersion` is provided and a row already exists
   * whose `updated_at` doesn't match it, the write is rejected with
   * `PreferencesConflictError` instead of being applied — the row was
   * changed by someone else (another tab/device) since the caller last read
   * it. When `baseVersion` is omitted, no check is performed and the write
   * always applies, matching the original (pre-#1178) behaviour of `set`.
   */
  setWithVersionCheck(
    wallet: string,
    preferences: NotificationPreferences,
    baseVersion?: number,
  ): { preferences: NotificationPreferences; updatedAt: number } {
    if (baseVersion !== undefined) {
      const existing = this.getRow(wallet);
      const currentVersion = existing ? existing.updated_at : 0;
      if (currentVersion !== baseVersion) {
        throw new PreferencesConflictError(
          existing
            ? rowToPreferences(existing)
            : { ...DEFAULT_NOTIFICATION_PREFERENCES },
          currentVersion,
        );
      }
    }

    const updatedAt = this.nextVersion();
    this.db
      .prepare(
        `INSERT INTO notification_preferences (wallet, milestone_approvals, contact_unlocks, updated_at)
         VALUES (@wallet, @milestone_approvals, @contact_unlocks, @updated_at)
         ON CONFLICT(wallet) DO UPDATE SET
           milestone_approvals = excluded.milestone_approvals,
           contact_unlocks = excluded.contact_unlocks,
           updated_at = excluded.updated_at`,
      )
      .run({
        wallet,
        milestone_approvals: preferences.milestoneApprovals ? 1 : 0,
        contact_unlocks: preferences.contactUnlocks ? 1 : 0,
        updated_at: updatedAt,
      });
    return { preferences: this.get(wallet), updatedAt };
  }

  /** Removes the preferences row for wallet. Returns the number of rows removed. */
  clearForWallet(wallet: string): number {
    const result = this.db
      .prepare('DELETE FROM notification_preferences WHERE wallet = ?')
      .run(wallet);
    return result.changes;
  }
}
