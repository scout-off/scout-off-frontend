/**
 * Embedded SQLite event store (dev / single replica).
 *
 * The `IndexerStore` interface is async so the Postgres replica store
 * (`PgEventStore`) can satisfy the same contract (issue #1468).
 */
import Database from 'better-sqlite3';
import type { EventFilter, IndexerEvent, PlayerRecord } from '../types';

export interface IndexerStore {
  insertBatch(events: IndexerEvent[]): Promise<void>;
  getCheckpoint(): Promise<number>;
  getEvents(filter: EventFilter): Promise<IndexerEvent[]>;
  getEventsByPlayer(playerId: string, filter?: EventFilter): Promise<IndexerEvent[]>;
  getPlayers(filter: PlayerFilter): Promise<PlayerRecord[]>;
  getApprovalCountsForWallets(wallets: string[]): Promise<Record<string, number>>;
  subscribe(listener: (event: IndexerEvent) => void): () => void;
}

export interface PlayerFilter {
  region?: string;
  position?: string;
  minLevel?: number;
  createdAfter?: number;
  cursor?: string;
  limit?: number;
}

const MAX_PLAYERS_LIMIT = 50;

export class EventStore implements IndexerStore {
  private static instance: EventStore | null = null;
  private db: Database.Database;
  private listeners = new Set<(event: IndexerEvent) => void>();

  private constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        ledger INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS checkpoint (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        ledger INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        region TEXT,
        position TEXT,
        level INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);
  }

  static getInstance(path = process.env.INDEXER_SQLITE_PATH ?? 'indexer.sqlite'): EventStore {
    if (!EventStore.instance) EventStore.instance = new EventStore(path);
    return EventStore.instance;
  }

  async insertBatch(events: IndexerEvent[]): Promise<void> {
    const insertEvent = this.db.prepare(
      'INSERT OR IGNORE INTO events (id, player_id, type, payload, ledger, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const upsertPlayer = this.db.prepare(`
      INSERT INTO players (player_id, region, position, level, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        region = COALESCE(excluded.region, players.region),
        position = COALESCE(excluded.position, players.position),
        level = MAX(players.level, excluded.level)
    `);
    const tx = this.db.transaction((batch: IndexerEvent[]) => {
      for (const event of batch) {
        insertEvent.run(event.id, event.playerId, event.type, JSON.stringify(event.payload), event.ledger, event.createdAt);
        upsertPlayer.run(
          event.playerId,
          (event.payload as { region?: string }).region ?? null,
          (event.payload as { position?: string }).position ?? null,
          (event.payload as { level?: number }).level ?? 0,
          event.createdAt,
        );
      }
    });
    tx(events);
    for (const event of events) {
      for (const listener of this.listeners) listener(event);
    }
  }

  async getCheckpoint(): Promise<number> {
    const row = this.db.prepare('SELECT ledger FROM checkpoint WHERE id = 1').get() as { ledger: number } | undefined;
    return row?.ledger ?? 0;
  }

  async getEvents(filter: EventFilter): Promise<IndexerEvent[]> {
    const { sql, params } = buildEventQuery(filter);
    const rows = this.db.prepare(sql).all(...params) as EventRow[];
    return rows.map(toEvent);
  }

  async getEventsByPlayer(playerId: string, filter: EventFilter = {}): Promise<IndexerEvent[]> {
    return this.getEvents({ ...filter, playerId });
  }

  async getPlayers(filter: PlayerFilter): Promise<PlayerRecord[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.region) {
      clauses.push('region = ?');
      params.push(filter.region);
    }
    if (filter.position) {
      clauses.push('position = ?');
      params.push(filter.position);
    }
    if (typeof filter.minLevel === 'number') {
      clauses.push('level >= ?');
      params.push(filter.minLevel);
    }
    if (typeof filter.createdAfter === 'number') {
      clauses.push('created_at > ?');
      params.push(filter.createdAfter);
    }
    if (filter.cursor) {
      clauses.push('player_id > ?');
      params.push(filter.cursor);
    }
    const limit = Math.min(filter.limit ?? MAX_PLAYERS_LIMIT, MAX_PLAYERS_LIMIT);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT player_id, region, position, level, created_at FROM players ${where} ORDER BY player_id ASC LIMIT ?`)
      .all(...params, limit) as PlayerRow[];
    return rows.map((row) => ({
      playerId: row.player_id,
      region: row.region ?? undefined,
      position: row.position ?? undefined,
      level: row.level,
      createdAt: row.created_at,
    }));
  }

  async getApprovalCountsForWallets(wallets: string[]): Promise<Record<string, number>> {
    if (wallets.length === 0) return {};
    const placeholders = wallets.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT player_id, COUNT(*) AS count FROM events WHERE type = 'approval' AND player_id IN (${placeholders}) GROUP BY player_id`,
      )
      .all(...wallets) as { player_id: string; count: number }[];
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.player_id] = row.count;
    return counts;
  }

  subscribe(listener: (event: IndexerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
    this.db.close();
    EventStore.instance = null;
  }
}

interface EventRow {
  id: string;
  player_id: string;
  type: string;
  payload: string;
  ledger: number;
  created_at: number;
}

interface PlayerRow {
  player_id: string;
  region: string | null;
  position: string | null;
  level: number;
  created_at: number;
}

function toEvent(row: EventRow): IndexerEvent {
  return {
    id: row.id,
    playerId: row.player_id,
    type: row.type,
    payload: JSON.parse(row.payload),
    ledger: row.ledger,
    createdAt: row.created_at,
  };
}

function buildEventQuery(filter: EventFilter): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.playerId) {
    clauses.push('player_id = ?');
    params.push(filter.playerId);
  }
  if (filter.type) {
    clauses.push('type = ?');
    params.push(filter.type);
  }
  if (typeof filter.fromLedger === 'number') {
    clauses.push('ledger >= ?');
    params.push(filter.fromLedger);
  }
  if (typeof filter.cursor === 'number') {
    clauses.push('ledger > ?');
    params.push(filter.cursor);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(filter.limit ?? 100, 500);
  return {
    sql: `SELECT id, player_id, type, payload, ledger, created_at FROM events ${where} ORDER BY ledger ASC, id ASC LIMIT ?`,
    params: [...params, limit],
  };
}
