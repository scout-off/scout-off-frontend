import Database from "better-sqlite3";
import { Pool } from "pg";
import type { IndexerEvent } from "./types";

export interface GetEventsFilter {
  type?: string;
  wallet?: string;
  limit?: number;
}

export interface GetEventsAfterFilter {
  afterId: number;
  types?: string[];
  wallet?: string;
  limit?: number;
}

export interface IndexerStore {
  insertEvent(event: IndexerEvent): void;
  getEvents(filter?: GetEventsFilter): { events: IndexerEvent[] };
  getEventsAfter(filter: GetEventsAfterFilter): { events: IndexerEvent[] };
  getLatestEventId(): number;
  subscribe(listener: (event: IndexerEvent) => void): () => void;
  close(): void;
}

function rowToEvent(row: Record<string, unknown>): IndexerEvent {
  return {
    id: Number(row.id),
    type: String(row.type),
    wallet: row.wallet == null ? null : String(row.wallet),
    data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
    ledger: Number(row.ledger),
    createdAt: String(row.created_at ?? row.createdAt ?? ""),
  } as IndexerEvent;
}

function buildAfterClause(filter: GetEventsAfterFilter): {
  sql: string;
  params: unknown[];
} {
  const clauses: string[] = ["id > ?"];
  const params: unknown[] = [filter.afterId];

  if (filter.types && filter.types.length > 0) {
    clauses.push(`type IN (${filter.types.map(() => "?").join(", ")})`);
    params.push(...filter.types);
  }

  if (filter.wallet) {
    clauses.push("wallet = ?");
    params.push(filter.wallet);
  }

  return { sql: clauses.join(" AND "), params };
}

export class SqliteIndexerStore implements IndexerStore {
  private db: Database.Database;
  private listeners = new Set<(event: IndexerEvent) => void>();

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        wallet TEXT,
        data TEXT NOT NULL,
        ledger INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_type_id ON events (type, id);
      CREATE INDEX IF NOT EXISTS idx_events_wallet_id ON events (wallet, id);
    `);
  }

  insertEvent(event: IndexerEvent): void {
    const stmt = this.db.prepare(
      `INSERT INTO events (type, wallet, data, ledger, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const info = stmt.run(
      event.type,
      event.wallet ?? null,
      JSON.stringify(event.data),
      event.ledger,
      event.createdAt,
    );
    const inserted: IndexerEvent = { ...event, id: Number(info.lastInsertRowid) };
    for (const listener of this.listeners) listener(inserted);
  }

  getEvents(filter: GetEventsFilter = {}): { events: IndexerEvent[] } {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.type) {
      clauses.push("type = ?");
      params.push(filter.type);
    }
    if (filter.wallet) {
      clauses.push("wallet = ?");
      params.push(filter.wallet);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = filter.limit ?? 200;
    const rows = this.db
      .prepare(`SELECT * FROM events ${where} ORDER BY id DESC LIMIT ?`)
      .all(...params, limit) as Record<string, unknown>[];
    return { events: rows.map(rowToEvent) };
  }

  getEventsAfter(filter: GetEventsAfterFilter): { events: IndexerEvent[] } {
    const { sql, params } = buildAfterClause(filter);
    const limit = filter.limit ?? 200;
    const rows = this.db
      .prepare(`SELECT * FROM events WHERE ${sql} ORDER BY id ASC LIMIT ?`)
      .all(...params, limit) as Record<string, unknown>[];
    return { events: rows.map(rowToEvent) };
  }

  getLatestEventId(): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(id), 0) AS id FROM events")
      .get() as { id: number };
    return Number(row.id);
  }

  subscribe(listener: (event: IndexerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.db.close();
  }
}

export class PostgresIndexerStore implements IndexerStore {
  private pool: Pool;
  private listeners = new Set<(event: IndexerEvent) => void>();

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id BIGSERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        wallet TEXT,
        data JSONB NOT NULL,
        ledger BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_type_id ON events (type, id);
      CREATE INDEX IF NOT EXISTS idx_events_wallet_id ON events (wallet, id);
    `);
  }

  insertEvent(event: IndexerEvent): void {
    void this.pool
      .query(
        `INSERT INTO events (type, wallet, data, ledger, created_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [event.type, event.wallet ?? null, event.data, event.ledger, event.createdAt],
      )
      .then((result) => {
        const inserted: IndexerEvent = {
          ...event,
          id: Number(result.rows[0].id),
        };
        for (const listener of this.listeners) listener(inserted);
      });
  }

  getEvents(filter: GetEventsFilter = {}): { events: IndexerEvent[] } {
    throw new Error("PostgresIndexerStore.getEvents is async; use getEventsAsync");
  }

  getEventsAfter(filter: GetEventsAfterFilter): { events: IndexerEvent[] } {
    throw new Error("PostgresIndexerStore.getEventsAfter is async; use getEventsAfterAsync");
  }

  async getEventsAsync(filter: GetEventsFilter = {}): Promise<{ events: IndexerEvent[] }> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.type) {
      params.push(filter.type);
      clauses.push(`type = $${params.length}`);
    }
    if (filter.wallet) {
      params.push(filter.wallet);
      clauses.push(`wallet = $${params.length}`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(filter.limit ?? 200);
    const result = await this.pool.query(
      `SELECT * FROM events ${where} ORDER BY id DESC LIMIT $${params.length}`,
      params,
    );
    return { events: result.rows.map(rowToEvent) };
  }

  async getEventsAfterAsync(
    filter: GetEventsAfterFilter,
  ): Promise<{ events: IndexerEvent[] }> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    params.push(filter.afterId);
    clauses.push(`id > $${params.length}`);

    if (filter.types && filter.types.length > 0) {
      const placeholders = filter.types.map((type) => {
        params.push(type);
        return `$${params.length}`;
      });
      clauses.push(`type IN (${placeholders.join(", ")})`);
    }

    if (filter.wallet) {
      params.push(filter.wallet);
      clauses.push(`wallet = $${params.length}`);
    }

    params.push(filter.limit ?? 200);
    const result = await this.pool.query(
      `SELECT * FROM events WHERE ${clauses.join(" AND ")} ORDER BY id ASC LIMIT $${params.length}`,
      params,
    );
    return { events: result.rows.map(rowToEvent) };
  }

  async getLatestEventIdAsync(): Promise<number> {
    const result = await this.pool.query("SELECT COALESCE(MAX(id), 0) AS id FROM events");
    return Number(result.rows[0].id);
  }

  getLatestEventId(): number {
    throw new Error("PostgresIndexerStore.getLatestEventId is async; use getLatestEventIdAsync");
  }

  subscribe(listener: (event: IndexerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    void this.pool.end();
  }
}
