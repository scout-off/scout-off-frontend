import * as http from 'http';
import { IndexerMetrics } from './metrics/IndexerMetrics';
import { getLastLedgerInfo, getLedgerLag, getRole } from './ledgerTracker';
import {
  startEventPolling,
  isEventType,
  getLastPollError,
  loadConfigFromEnv,
  createRpcClient,
  type EventPollerHandle,
} from './eventPoller';
import {
  EventStore,
  MAX_LIMIT,
  MAX_PLAYERS_LIMIT,
  decodePlayerCursor,
  type PlayerQueryFilter,
  type PlayerRecord,
  type EventRecord,
  type QueryFilter,
  type WalletApprovalWindow,
} from './db/eventStore';
import { closeStore, createPgPoolFromEnv, getStore, initStore } from './db';
import { LeaderElector } from './leaderElection';
import type { EventType } from './metrics/IndexerMetrics';
import {
  logger,
  parseTraceparent,
  newTraceContext,
  withTraceContext,
  makeChildTraceparent,
  TRACEPARENT_HEADER,
} from './logger';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

const startTime = Date.now();

/** How long a fresh indexer may report `starting` before it's `unhealthy`. */
const STARTUP_GRACE_MS = 120_000;
/** A last successful poll older than this marks the indexer `degraded`. */
const STALE_AFTER_MS = 60_000;
const MAX_LEDGER_LAG = process.env.HEALTH_MAX_LEDGER_LAG
  ? parseInt(process.env.HEALTH_MAX_LEDGER_LAG, 10)
  : 100;
const SHUTDOWN_TIMEOUT_MS = 10_000;

export type HealthStatus = 'starting' | 'ok' | 'degraded' | 'unhealthy';

export interface HealthInput {
  now: number;
  startedAt: number;
  lastIngestedAt: number; // 0 = never
  pollerRunning: boolean;
  pollerHealthy: boolean; // false after repeated consecutive RPC failures
  ledgerLag: number;
}

/**
 * Health state machine (issue #1334): starting → ok → degraded → unhealthy.
 * `unhealthy` means the poller isn't running, keeps failing, or hasn't
 * ingested anything by the end of the startup grace period.
 */
export function computeHealthStatus(input: HealthInput): HealthStatus {
  if (!input.pollerRunning || !input.pollerHealthy) return 'unhealthy';
  if (input.lastIngestedAt === 0) {
    return input.now - input.startedAt < STARTUP_GRACE_MS
      ? 'starting'
      : 'unhealthy';
  }
  if (
    input.now - input.lastIngestedAt > STALE_AFTER_MS ||
    input.ledgerLag > MAX_LEDGER_LAG
  ) {
    return 'degraded';
  }
  return 'ok';
}

let poller: EventPollerHandle | null = null;
let pollerStartError: string | null = null;

/** Records the running poller (or why it failed to start) for /health. */
export function setPollerState(
  handle: EventPollerHandle | null,
  startError: string | null = null,
): void {
  poller = handle;
  pollerStartError = startError;
}

function isPollerRunning(): boolean {
  return poller?.isRunning() ?? false;
}

async function handleHealth(res: http.ServerResponse): Promise<void> {
  const role = getRole();
  const now = Date.now();

  if (role === 'follower') {
    // Followers don't poll; report the leader's progress from the shared
    // checkpoint instead of this process's (idle) ledgerTracker.
    const checkpoint = await getStore().getCheckpoint();
    const checkpointAgeMs = checkpoint ? now - checkpoint.updatedAt : null;
    return sendJson(res, 200, {
      status:
        checkpointAgeMs !== null && checkpointAgeMs <= STALE_AFTER_MS
          ? 'ok'
          : 'degraded',
      role,
      lastLedger: checkpoint?.lastLedger ?? 0,
      leaderLag: checkpoint
        ? Math.max(0, checkpoint.networkLedger - checkpoint.lastLedger)
        : null,
      leaderCheckpointAgeMs: checkpointAgeMs,
      uptime: Math.floor((now - startTime) / 1000),
    });
  }

  const { lastLedger, timestamp } = getLastLedgerInfo();
  const pollerRunning = isPollerRunning();
  const ledgerLag = getLedgerLag();
  const status = computeHealthStatus({
    now,
    startedAt: startTime,
    lastIngestedAt: timestamp,
    pollerRunning,
    pollerHealthy: IndexerMetrics.getInstance().snapshot().isHealthy,
    ledgerLag,
  });
  sendJson(res, status === 'unhealthy' ? 503 : 200, {
    status,
    role,
    lastLedger,
    lastUpdated: timestamp > 0 ? timestamp : null,
    ledgerLag,
    pollerRunning,
    lastError: pollerStartError ?? getLastPollError(),
    uptime: Math.floor((now - startTime) / 1000),
  });
}

function handleMetrics(res: http.ServerResponse): void {
  const snap = IndexerMetrics.getInstance().snapshot();
  const lag = getLedgerLag();

  const lines: string[] = [
    '# HELP indexer_events_total Total events processed by type',
    '# TYPE indexer_events_total counter',
    ...Object.entries(snap.eventCounts).map(
      ([type, count]) => `indexer_events_total{type="${type}"} ${count}`,
    ),
    '# HELP indexer_unknown_events_total Total events with an unknown topic or contract version',
    '# TYPE indexer_unknown_events_total counter',
    `indexer_unknown_events_total ${snap.unknownEvents}`,
    '# HELP indexer_processed_total Total events processed (all types)',
    '# TYPE indexer_processed_total counter',
    `indexer_processed_total ${snap.totalProcessed}`,
    '# HELP indexer_errors_total Total processing failures',
    '# TYPE indexer_errors_total counter',
    `indexer_errors_total ${snap.totalFailures}`,
    '# HELP indexer_error_rate_percent Failure rate as a percentage',
    '# TYPE indexer_error_rate_percent gauge',
    `indexer_error_rate_percent ${snap.errorRatePercent.toFixed(4)}`,
    '# HELP indexer_latency_avg_ms Processing latency EMA in milliseconds',
    '# TYPE indexer_latency_avg_ms gauge',
    `indexer_latency_avg_ms ${snap.latencyAvgMs.toFixed(4)}`,
    '# HELP indexer_latency_p95_ms Processing latency p95 in milliseconds (sliding window)',
    '# TYPE indexer_latency_p95_ms gauge',
    `indexer_latency_p95_ms ${snap.latencyP95Ms.toFixed(4)}`,
    '# HELP indexer_ledger_lag Difference between network ledger and last indexed ledger',
    '# TYPE indexer_ledger_lag gauge',
    `indexer_ledger_lag ${lag}`,
    '# HELP indexer_healthy 1 if indexer is healthy, 0 otherwise',
    '# TYPE indexer_healthy gauge',
    `indexer_healthy ${snap.isHealthy ? 1 : 0}`,
    '# HELP indexer_poller_running 1 if the event poller is running, 0 otherwise',
    '# TYPE indexer_poller_running gauge',
    `indexer_poller_running ${isPollerRunning() ? 1 : 0}`,
    '# HELP indexer_is_leader 1 if this replica holds the polling leader lock, 0 otherwise',
    '# TYPE indexer_is_leader gauge',
    `indexer_is_leader ${getRole() === 'leader' ? 1 : 0}`,
  ];

  res.writeHead(200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
  });
  res.end(lines.join('\n') + '\n');
}

const PLAYER_EVENTS_PATH = /^\/players\/([^/]+)\/events$/;
const VALIDATOR_EVENTS_PATH = /^\/validators\/([^/]+)\/events$/;
const activeStreams = new Set<http.ServerResponse>();

/**
 * Max length for a region/position filter value — guards against absurd
 * query strings; real values are short slugs/labels ("West Africa", "ST").
 */
const MAX_FILTER_VALUE_LENGTH = 100;

/**
 * GET /stream?topics=<comma-separated>&wallet=<address>
 *
 * Server-Sent Events endpoint. Pushes decoded contract events to the client
 * as they are ingested. Supports:
 *
 *   - `topics`      comma-separated list of event types to filter on;
 *                   omit or leave blank to receive all topics.
 *   - `wallet`      only receive events that involve this wallet address
 *                   (playerId, scout, or validator field).
 *   - `Last-Event-ID` HTTP header: the client's last received event id
 *                   (the DB row id). On reconnect, any events whose id >
 *                   Last-Event-ID are replayed before live streaming begins.
 *
 * Heartbeats (`: heartbeat\n\n`) are sent every 25 s so proxies and load
 * balancers don't close idle connections.
 *
 * Scaling note: fan-out is in-process. A horizontally-scaled deployment
 * would replace the EventStore subscriber registry with Redis pub/sub.
 */
function handleStream(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): void {
  const topicsParam = url.searchParams.get('topics');
  const walletParam = url.searchParams.get('wallet');
  const lastEventIdHeader = req.headers['last-event-id'];
  const lastEventId =
    typeof lastEventIdHeader === 'string' && lastEventIdHeader.length > 0
      ? parseInt(lastEventIdHeader, 10)
      : 0;

  const topics = topicsParam
    ? topicsParam
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    : [];

  for (const t of topics) {
    if (!isEventType(t)) {
      return sendJson(res, 400, { error: `Unknown topic: ${t}` });
    }
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  activeStreams.add(res);

  const store = getStore();

  const filter: QueryFilter = {
    topics: topics.length > 0 ? (topics as EventType[]) : undefined,
    wallet: walletParam ?? undefined,
  };

  const sendEvent = (event: EventRecord): void => {
    res.write(`id: ${event.id}\n`);
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Replay any events the client missed while disconnected.
  if (lastEventId > 0) {
    store
      .getEvents(filter)
      .then((events) => {
        for (const event of events) {
          if (event.id > lastEventId) sendEvent(event);
        }
      })
      .catch((err) => {
        logger.error('stream replay failed', { error: String(err) });
      });
  }

  const unsubscribe = store.subscribe(filter, sendEvent);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25_000);

  const cleanup = (): void => {
    clearInterval(heartbeat);
    unsubscribe();
    activeStreams.delete(res);
  };

  req.on('close', cleanup);
  res.on('close', cleanup);
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function parseLimit(
  raw: string | null,
  fallback: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function parsePlayerFilter(url: URL): PlayerQueryFilter {
  const filter: PlayerQueryFilter = {};
  const region = url.searchParams.get('region');
  const position = url.searchParams.get('position');
  const minLevel = url.searchParams.get('minLevel');
  const createdAfter = url.searchParams.get('createdAfter');
  const cursor = url.searchParams.get('cursor');
  const limit = url.searchParams.get('limit');

  if (region && region.length <= MAX_FILTER_VALUE_LENGTH) filter.region = region;
  if (position && position.length <= MAX_FILTER_VALUE_LENGTH)
    filter.position = position;
  if (minLevel) {
    const n = parseInt(minLevel, 10);
    if (Number.isFinite(n)) filter.minLevel = n;
  }
  if (createdAfter) {
    const n = parseInt(createdAfter, 10);
    if (Number.isFinite(n)) filter.createdAfter = n;
  }
  if (cursor) {
    const decoded = decodePlayerCursor(cursor);
    if (decoded) filter.cursor = decoded;
  }
  filter.limit = parseLimit(limit, MAX_PLAYERS_LIMIT, MAX_PLAYERS_LIMIT);
  return filter;
}

async function handlePlayers(
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const filter = parsePlayerFilter(url);
  const players: PlayerRecord[] = await getStore().getPlayers(filter);
  sendJson(res, 200, { players });
}

async function handlePlayerEvents(
  res: http.ServerResponse,
  playerId: string,
  url: URL,
): Promise<void> {
  const limit = parseLimit(url.searchParams.get('limit'), 50, MAX_LIMIT);
  const events = await getStore().getEventsByPlayer(playerId, limit);
  sendJson(res, 200, { events });
}

async function handleValidatorEvents(
  res: http.ServerResponse,
  validatorId: string,
  url: URL,
): Promise<void> {
  const limit = parseLimit(url.searchParams.get('limit'), 50, MAX_LIMIT);
  const events = await getStore().getEventsByValidator(validatorId, limit);
  sendJson(res, 200, { events });
}

async function handleApprovalCounts(
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const walletsParam = url.searchParams.get('wallets');
  if (!walletsParam) {
    return sendJson(res, 400, { error: 'wallets query parameter required' });
  }
  const wallets = walletsParam
    .split(',')
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  const windowParam = url.searchParams.get('window');
  const window: WalletApprovalWindow =
    windowParam === '24h' || windowParam === '7d' || windowParam === '30d'
      ? windowParam
      : '7d';
  const counts = await getStore().getApprovalCountsForWallets(wallets, window);
  sendJson(res, 200, { counts });
}

async function route(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (path === '/health') return handleHealth(res);
  if (path === '/metrics') return handleMetrics(res);
  if (path === '/stream') return handleStream(req, res, url);
  if (path === '/players') return handlePlayers(res, url);
  if (path === '/approval-counts') return handleApprovalCounts(res, url);

  const playerMatch = PLAYER_EVENTS_PATH.exec(path);
  if (playerMatch) {
    return handlePlayerEvents(res, decodeURIComponent(playerMatch[1]), url);
  }

  const validatorMatch = VALIDATOR_EVENTS_PATH.exec(path);
  if (validatorMatch) {
    return handleValidatorEvents(
      res,
      decodeURIComponent(validatorMatch[1]),
      url,
    );
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function shutdown(signal: string): Promise<void> {
  logger.info('shutting down', { signal });

  const timeout = setTimeout(() => {
    logger.error('shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timeout.unref();

  for (const res of activeStreams) {
    res.end();
  }
  activeStreams.clear();

  if (poller) {
    await poller.stop();
  }

  // Close whichever store is active (SQLite file or Postgres pool).
  await closeStore();

  process.exit(0);
}

export async function startServer(): Promise<http.Server> {
  await initStore();

  const server = http.createServer((req, res) => {
    const traceparent = parseTraceparent(req.headers[TRACEPARENT_HEADER]);
    const ctx = traceparent
      ? { traceId: traceparent.traceId, spanId: traceparent.spanId }
      : newTraceContext();
    const childTraceparent = makeChildTraceparent(ctx);
    res.setHeader(TRACEPARENT_HEADER, childTraceparent);

    withTraceContext(ctx, () => {
      route(req, res).catch((err) => {
        logger.error('request failed', { error: String(err) });
        if (!res.headersSent) {
          sendJson(res, 500, { error: 'Internal server error' });
        } else {
          res.end();
        }
      });
    });
  });

  server.listen(PORT, () => {
    logger.info('indexer server listening', { port: PORT });
  });

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  return server;
}

if (require.main === module) {
  startServer().catch((err) => {
    logger.error('failed to start indexer server', { error: String(err) });
    process.exit(1);
  });
}
