/**
 * leaderElection — picks exactly one polling replica out of N (issue #1319).
 *
 * Uses a session-level Postgres advisory lock (`pg_try_advisory_lock`) held
 * on a dedicated connection. Postgres releases the lock the moment that
 * connection dies, so when the leader process is killed a follower acquires
 * it on its next attempt — i.e. within one lease interval.
 *
 * The lease is renewed on every poll (`tick()`): the leader confirms it
 * still holds the lock, and the renewal must complete within `leaseMs`. Any
 * failure or timeout means the lock may be gone, so the replica steps down
 * immediately (and drops its connection so the lock is certainly released)
 * rather than risk two replicas polling at once.
 *
 * The same election also gates the retention-window backfill worker
 * (issue #1667): only the leader fills gaps, so a gap is never backfilled
 * twice concurrently. `isLeader` is the single source of truth for both.
 */
import type { PgPool, PgPoolClient } from './db/pgEventStore';

/** Arbitrary but fixed 64-bit key; override to run several indexers on one DB. */
export const DEFAULT_LEADER_LOCK_KEY = 7_319_001;

export interface LeaderElectorOptions {
  lockKey?: number;
  /** Max time a lock acquire/renew may take before the replica steps down. */
  leaseMs: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`leader lease renewal timed out after ${ms}ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

export class LeaderElector {
  private client: PgPoolClient | null = null;
  private leader = false;
  private readonly lockKey: number;
  private readonly leaseMs: number;

  constructor(
    private readonly pool: PgPool,
    options: LeaderElectorOptions,
  ) {
    this.lockKey = options.lockKey ?? DEFAULT_LEADER_LOCK_KEY;
    this.leaseMs = options.leaseMs;
  }

  get isLeader(): boolean {
    return this.leader;
  }

  /**
   * Acquires (follower) or renews (leader) the lock. Returns whether this
   * replica is the leader for the coming poll cycle.
   */
  async tick(): Promise<boolean> {
    try {
      if (!this.client) {
        const client = await withTimeout(this.pool.connect(), this.leaseMs);
        // A dropped lock connection must demote us, not crash the process.
        client.on?.('error', () => this.dropConnection());
        this.client = client;
      }
      const client = this.client;
      if (this.leader) {
        const { rows } = await withTimeout(
          client.query(
            `SELECT EXISTS (
               SELECT 1 FROM pg_locks
               WHERE locktype = 'advisory' AND granted
                 AND pid = pg_backend_pid() AND objsubid = 1
                 AND ((classid::bigint << 32) | objid::bigint) = $1
             ) AS held`,
            [this.lockKey],
          ),
          this.leaseMs,
        );
        this.leader = rows[0]?.held === true;
      } else {
        const { rows } = await withTimeout(
          client.query('SELECT pg_try_advisory_lock($1) AS acquired', [
            this.lockKey,
          ]),
          this.leaseMs,
        );
        this.leader = rows[0]?.acquired === true;
      }
    } catch {
      this.dropConnection();
    }
    return this.leader;
  }

  /**
   * Runs `fn` only while this replica holds the lease (issue #1667). The
   * backfill worker uses this so exactly one replica fills a gap at a time;
   * followers skip the work entirely. The lease is re-checked before the
   * callback runs, and a step-down mid-run aborts the callback's result.
   */
  async runIfLeader<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (!(await this.tick())) return undefined;
    const result = await fn();
    // If we lost the lease while working, discard the result so callers do
    // not treat a follower's partial backfill as authoritative.
    return this.leader ? result : undefined;
  }

  /** Releases the lock (graceful shutdown) so a follower can take over at once. */
  async release(): Promise<void> {
    if (this.client && this.leader) {
      await this.client
        .query('SELECT pg_advisory_unlock($1)', [this.lockKey])
        .catch(() => undefined);
    }
    this.leader = false;
    this.client?.release();
    this.client = null;
  }

  private dropConnection(): void {
    this.leader = false;
    // Destroy (not just return to the pool) so Postgres ends the session
    // and releases any advisory lock it may still hold.
    this.client?.release(true);
    this.client = null;
  }
}
