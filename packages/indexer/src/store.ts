import type { Database } from 'better-sqlite3';
import type { Pool } from 'pg';
import type { IndexedEvent } from './types';

export type GapStatus = 'open' | 'backfilling' | 'closed';

export interface RetentionGap {
  id: number;
  gapStart: number;
  gapEnd: number;
  status: GapStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IndexerStore {
  insertEvent(event: IndexedEvent): Promise<void>;
  insertEvents(events: IndexedEvent[]): Promise<void>;
  getCursor(): Promise<number | null>;
  setCursor(ledger: number): Promise<void>;
  recordGap(gapStart: number, gapEnd: number): Promise<RetentionGap>;
  getOpenGaps(): Promise<RetentionGap[]>;
  markGapBackfilling(id: number): Promise<void>;
  closeGap(id: number): Promise<void>;
  close(): Promise<void>;
}

function eventKey(event: IndexedEvent): string {
  return `${event.ledger}:${event.txHash}:${event.opIndex}`;
}

function rowToGap(row: Record<string, unknown>): RetentionGap {
  return {
    id: Number(row.id),
    gapStart: Number(row.gap_start),
    gapEnd: Number(row.gap_end),
    status: String(row.status) as GapStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class SqliteIndexerStore implements IndexerStore {
  constructor(private readonly db: Database) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS indexed_events (
        ledger INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        op_index INTEGER NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (ledger, tx_hash, op_index)
      );
      CREATE TABLE IF NOT EXISTS indexer_cursor (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        ledger INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS retention_gaps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gap_start INTEGER NOT NULL,
        gap_end INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  async insertEvent(event: IndexedEvent): Promise<void> {
    await this.insertEvents([event]);
  }

  async insertEvents(events: IndexedEvent[]): Promise<void> {
    if (events.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO indexed_events (ledger, tx_hash, op_index, payload)
       VALUES (?, ?, ?, ?)`,
    );
    const tx = this.db.transaction((batch: IndexedEvent[]) => {
      for (const event of batch) {
        stmt.run(
          event.ledger,
          event.txHash,
          event.opIndex,
          JSON.stringify(event),
        );
      }
    });
    tx(events);
  }

  async getCursor(): Promise<number | null> {
    const row = this.db
      .prepare(`SELECT ledger FROM indexer_cursor WHERE id = 1`)
      .get() as { ledger: number } | undefined;
    return row ? row.ledger : null;
  }

  async setCursor(ledger: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO indexer_cursor (id, ledger) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET ledger = excluded.ledger`,
      )
      .run(ledger);
  }

  async recordGap(gapStart: number, gapEnd: number): Promise<RetentionGap> {
    const info = this.db
      .prepare(
        `INSERT INTO retention_gaps (gap_start, gap_end, status) VALUES (?, ?, 'open')`,
      )
      .run(gapStart, gapEnd);
    const row = this.db
      .prepare(`SELECT * FROM retention_gaps WHERE id = ?`)
      .get(info.lastInsertRowid) as Record<string, unknown>;
    return rowToGap(row);
  }

  async getOpenGaps(): Promise<RetentionGap[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM retention_gaps WHERE status != 'closed' ORDER BY gap_start ASC`,
      )
      .all() as Record<string, unknown>[];
    return rows.map(rowToGap);
  }

  async markGapBackfilling(id: number): Promise<void> {
    this.db
      .prepare(
        `UPDATE retention_gaps SET status = 'backfilling', updated_at = datetime('now') WHERE id = ?`,
      )
      .run(id);
  }

  async closeGap(id: number): Promise<void> {
    this.db
      .prepare(
        `UPDATE retention_gaps SET status = 'closed', updated_at = datetime('now') WHERE id = ?`,
      )
      .run(id);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export class PostgresIndexerStore implements IndexerStore {
  constructor(private readonly pool: Pool) {}

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS indexed_events (
        ledger BIGINT NOT NULL,
        tx_hash TEXT NOT NULL,
        op_index INTEGER NOT NULL,
        payload JSONB NOT NULL,
        PRIMARY KEY (ledger, tx_hash, op_index)
      );
      CREATE TABLE IF NOT EXISTS indexer_cursor (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        ledger BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS retention_gaps (
        id BIGSERIAL PRIMARY KEY,
        gap_start BIGINT NOT NULL,
        gap_end BIGINT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  async insertEvent(event: IndexedEvent): Promise<void> {
    await this.insertEvents([event]);
  }

  async insertEvents(events: IndexedEvent[]): Promise<void> {
    if (events.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const event of events) {
        await client.query(
          `INSERT INTO indexed_events (ledger, tx_hash, op_index, payload)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (ledger, tx_hash, op_index) DO NOTHING`,
          [event.ledger, event.txHash, event.opIndex, JSON.stringify(event)],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getCursor(): Promise<number | null> {
    const res = await this.pool.query(
      `SELECT ledger FROM indexer_cursor WHERE id = 1`,
    );
    return res.rows.length > 0 ? Number(res.rows[0].ledger) : null;
  }

  async setCursor(ledger: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO indexer_cursor (id, ledger) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET ledger = excluded.ledger`,
      [ledger],
    );
  }

  async recordGap(gapStart: number, gapEnd: number): Promise<RetentionGap> {
    const res = await this.pool.query(
      `INSERT INTO retention_gaps (gap_start, gap_end, status)
       VALUES ($1, $2, 'open') RETURNING *`,
      [gapStart, gapEnd],
    );
    return rowToGap(res.rows[0]);
  }

  async getOpenGaps(): Promise<RetentionGap[]> {
    const res = await this.pool.query(
      `SELECT * FROM retention_gaps WHERE status != 'closed' ORDER BY gap_start ASC`,
    );
    return res.rows.map(rowToGap);
  }

  async markGapBackfilling(id: number): Promise<void> {
    await this.pool.query(
      `UPDATE retention_gaps SET status = 'backfilling', updated_at = now() WHERE id = $1`,
      [id],
    );
  }

  async closeGap(id: number): Promise<void> {
    await this.pool.query(
      `UPDATE retention_gaps SET status = 'closed', updated_at = now() WHERE id = $1`,
      [id],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export { eventKey };
