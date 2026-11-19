import { Pool, PoolClient } from "pg";
import type { IndexerStore, StoredEvent, EventFilter, EventsAfterFilter } from "./store";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  wallet TEXT,
  ledger BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS events_type_id_idx ON events (type, id);
CREATE INDEX IF NOT EXISTS events_wallet_id_idx ON events (wallet, id);
`;

export class PostgresStore implements IndexerStore {
  private pool: Pool;
  private listeners = new Set<(event: StoredEvent) => void>();

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA);
  }

  async append(event: Omit<StoredEvent, "id">): Promise<StoredEvent> {
    const { rows } = await this.pool.query(
      `INSERT INTO events (type, wallet, ledger, tx_hash, payload)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, type, wallet, ledger, tx_hash, payload`,
      [event.type, event.wallet ?? null, event.ledger, event.txHash, event.payload],
    );
    const stored = this.rowToEvent(rows[0]);
    for (const listener of this.listeners) listener(stored);
    return stored;
  }

  async getEvents(filter: EventFilter): Promise<StoredEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.type) {
      params.push(filter.type);
      conditions.push(`type = $${params.length}`);
    }
    if (filter.wallet) {
      params.push(filter.wallet);
      conditions.push(`wallet = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(filter.limit ?? 200);
    const { rows } = await this.pool.query(
      `SELECT id, type, wallet, ledger, tx_hash, payload
       FROM events ${where}
       ORDER BY id DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows.map((row) => this.rowToEvent(row));
  }

  async getEventsAfter(filter: EventsAfterFilter): Promise<StoredEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    params.push(filter.afterId);
    conditions.push(`id > $${params.length}`);
    if (filter.types && filter.types.length > 0) {
      params.push(filter.types);
      conditions.push(`type = ANY($${params.length})`);
    }
    if (filter.wallet) {
      params.push(filter.wallet);
      conditions.push(`wallet = $${params.length}`);
    }
    params.push(filter.limit);
    const { rows } = await this.pool.query(
      `SELECT id, type, wallet, ledger, tx_hash, payload
       FROM events
       WHERE ${conditions.join(" AND ")}
       ORDER BY id ASC
       LIMIT $${params.length}`,
      params,
    );
    return rows.map((row) => this.rowToEvent(row));
  }

  subscribe(listener: (event: StoredEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private rowToEvent(row: Record<string, unknown>): StoredEvent {
    return {
      id: Number(row.id),
      type: row.type as string,
      wallet: (row.wallet as string | null) ?? undefined,
      ledger: Number(row.ledger),
      txHash: row.tx_hash as string,
      payload: row.payload as Record<string, unknown>,
    };
  }
}
