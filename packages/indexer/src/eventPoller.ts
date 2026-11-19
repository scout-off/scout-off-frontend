import { createHash } from 'crypto';
// stellar-sdk 13 removed the deprecated `SorobanRpc` alias; `rpc` is the same namespace.
import { rpc as SorobanRpc, Networks, xdr } from '@stellar/stellar-sdk';
import {
  decodeSorobanEvent,
  type EventType as SharedEventType,
} from '@scoutoff/contract-events';
import { IndexerMetrics, type EventType } from './metrics/IndexerMetrics';
import {
  setRole,
  updateLastLedger,
  updateNetworkLedger,
} from './ledgerTracker';
import { EventStore, type IndexerStore } from './db/eventStore';
import type { LeaderElector } from './leaderElection';
import { logger } from './logger';

/**
 * Polls Soroban RPC's getEvents for new ScoutOff contract events and feeds
 * them into ledgerTracker and IndexerMetrics — the module described but
 * never implemented in README.md's "Event Listener / Poller" section.
 *
 * Config (env vars, all per README.md):
 *   SOROBAN_RPC_URL, CONTRACT_ID (required)
 *   NETWORK_PASSPHRASE, POLL_INTERVAL_MS, START_LEDGER (optional, defaulted)
 *   ARCHIVE_RPC_URL (optional; enables retention-window backfill, #1667)
 */

export const EVENT_TYPES: readonly EventType[] = [
  'player_registered',
  'profile_updated',
  'milestone_approved',
  'milestone_revoked',
  'scout_subscribed',
  'player_contacted',
  'trial_offer_logged',
  'fees_withdrawn',
  'unknown',
];

export function isEventType(name: unknown): name is EventType {
  return (
    typeof name === 'string' &&
    (EVENT_TYPES as readonly string[]).includes(name)
  );
}

export interface PollerConfig {
  rpcUrl: string;
  contractId: string;
  networkPassphrase: string;
  pollIntervalMs: number;
  startLedger: number;
  contractVersion: number;
  /**
   * Full-history RPC / archive endpoint used only to backfill retention
   * window gaps (issue #1667). When unset, gaps are still recorded but the
   * backfill worker is disabled and the gap stays open (visible in /health).
   */
  archiveRpcUrl?: string;
}

/** Reads and validates poller config from process.env. */
export function loadConfigFromEnv(): PollerConfig {
  const rpcUrl = process.env.SOROBAN_RPC_URL;
  const contractId = process.env.CONTRACT_ID;
  if (!rpcUrl) throw new Error('SOROBAN_RPC_URL is required');
  if (!contractId) throw new Error('CONTRACT_ID is required');

  return {
    rpcUrl,
    contractId,
    networkPassphrase: process.env.NETWORK_PASSPHRASE ?? Networks.TESTNET,
    pollIntervalMs: process.env.POLL_INTERVAL_MS
      ? parseInt(process.env.POLL_INTERVAL_MS, 10)
      : 5000,
    startLedger: process.env.START_LEDGER
      ? parseInt(process.env.START_LEDGER, 10)
      : 0,
    contractVersion: process.env.CONTRACT_VERSION
      ? parseInt(process.env.CONTRACT_VERSION, 10)
      : 1,
    archiveRpcUrl: process.env.ARCHIVE_RPC_URL || undefined,
  };
}

/**
 * Minimal surface of SorobanRpc.Server this module needs. A real
 * SorobanRpc.Server instance satisfies this structurally, and tests can
 * supply a lightweight mock instead of standing up a real RPC connection.
 */
export interface RpcClient {
  getEvents(request: {
    startLedger?: number;
    filters: Array<{ type?: 'contract'; contractIds?: string[] }>;
    limit?: number;
  }): Promise<{ latestLedger: number; events: RawEvent[] }>;
  getLatestLedger(): Promise<{ sequence: number }>;
}

export interface RawEvent {
  ledger: number;
  ledgerClosedAt: string;
  topic: xdr.ScVal[];
  value: xdr.ScVal;
  /**
   * Soroban RPC's own globally-unique id for this event (conventionally
   * `<ledgerSeq>-<eventIndexInLedger>`), when the node/SDK response
   * includes one. Preferred over the content hash fallback in
   * `decodeEvent` when present, since it's authoritative rather than
   * derived. Optional because it isn't part of the minimal `RpcClient`
   * contract this module was written against (see the ASSUMPTION note on
   * `decodeEvent`) and test mocks may omit it.
   */
  id?: string;
}

export interface DecodedEvent {
  type: EventType;
  contractVersion: number;
  ledger: number;
  timestamp: number;
  data: Record<string, unknown>;
  /**
   * Stable, content-derived identifier for the underlying on-chain event —
   * NOT a timestamp-of-observation. Two `decodeEvent` calls over the same
   * raw event (e.g. because a poll cycle re-fetched an already-processed
   * ledger range) always produce the same `eventId`, which
   * `EventStore.insertEvent` uses to make ingestion idempotent (issue
   * #1180: exactly-once notification delivery). See `computeEventId`.
   */
  eventId: string;
}

export function createRpcClient(config: PollerConfig): RpcClient {
  const allowHttp = new URL(config.rpcUrl).protocol === 'http:';
  return new SorobanRpc.Server(config.rpcUrl, {
    allowHttp,
  }) as unknown as RpcClient;
}

/**
 * Creates an RPC client for the archive endpoint (issue #1667). Returns
 * `undefined` when `ARCHIVE_RPC_URL` is not configured, in which case the
 * backfill worker is disabled and gaps remain open (and visible in /health).
 */
export function createArchiveClient(config: PollerConfig): RpcClient | undefined {
  if (!config.archiveRpcUrl) return undefined;
  const allowHttp = new URL(config.archiveRpcUrl).protocol === 'http:';
  return new SorobanRpc.Server(config.archiveRpcUrl, {
    allowHttp,
  }) as unknown as RpcClient;
}

export function decodeEvent(raw: RawEvent, contractVersion = 1): DecodedEvent {
  const decoded = decodeSorobanEvent({
    topic: raw.topic ?? [],
    value: raw.value,
    contractVersion,
  });
  const timestamp = Math.floor(new Date(raw.ledgerClosedAt).getTime() / 1000);

  return {
    type: decoded.type as SharedEventType,
    contractVersion: decoded.version,
    ledger: raw.ledger,
    timestamp,
    data: {
      ...decoded.data,
      contractVersion: decoded.version,
      ledger: raw.ledger,
      timestamp,
    },
    eventId: computeEventId(decoded.type, raw),
  };
}

/**
 * Derives a stable, content-based identifier for a raw event — the fix for
 * issue #1180 (no exactly-once guarantee across overlapping poll cycles).
 *
 * The poller's cursor (`ledgerTracker`/`startEventPolling`'s local `cursor`
 * variable) lives only in process memory, so a restart, a misconfigured
 * `START_LEDGER`, or two poller instances running concurrently can all
 * cause the same ledger range to be fetched from Soroban RPC more than
 * once. Without a stable id, each re-fetch of the same on-chain event would
 * turn into a brand-new `events` row (a fresh AUTOINCREMENT id), which is
 * exactly the duplicate-notification bug the issue describes.
 *
 * Preference order:
 *  1. `raw.id` — Soroban RPC's own globally-unique per-event id, when the
 *     node/SDK response includes one. Authoritative: two fetches of the
 *     same on-chain event always report the same id.
 *  2. A SHA-256 digest of the event's ledger + topic + value (all
 *     deterministic, content-derived fields — never a fetch/observation
 *     timestamp). Re-fetching the same raw event yields byte-identical
 *     XDR for `topic`/`value`, so the digest — and therefore `eventId` —
 *     is identical across polls. This is the fallback used by every
 *     existing test mock, which doesn't set `raw.id`.
 */
function computeEventId(name: EventType, raw: RawEvent): string {
  if (raw.id) {
    return `${name}:${raw.id}`;
  }
  const topicKey = raw.topic.map((t) => t.toXDR('base64')).join('|');
  const valueKey = raw.value ? raw.value.toXDR('base64') : '';
  const digest = createHash('sha256')
    .update(`${raw.ledger}:${topicKey}:${valueKey}`)
    .digest('hex')
    .slice(0, 24);
  return `${name}:${raw.ledger}:${digest}`;
}

/**
 * Heuristics for detecting that a `startLedger` is outside the Soroban RPC
 * node's event retention window.
 *
 * Soroban RPC typically returns an error message containing the phrase
 * "start is before oldest ledger" or similar when the requested startLedger
 * predates the oldest ledger the node still has events for. The exact
 * message text varies across node versions; we check the most common forms.
 *
 * This function is intentionally conservative: a false-negative (not
 * detecting a retention error) falls back to ordinary retry behaviour, which
 * is the existing (safe) default. A false-positive would cause the poller to
 * skip forward unnecessarily — so we only match known, specific phrases.
 */
export function isRetentionWindowError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('start is before oldest ledger') ||
    msg.includes('startledger must be within the ledger retention window') ||
    msg.includes('outside the ledger retention window') ||
    msg.includes('ledger not found') ||
    msg.includes('start ledger is before') ||
    // Soroban RPC JSON-RPC error code -32600 is used for "invalid request",
    // which the node returns for out-of-window startLedger on some builds.
    (err as { code?: number }).code === -32600
  );
}

/**
 * A persisted retention-window gap (issue #1667). `gap_start` is the first
 * ledger the poller could not read from the live RPC node; `gap_end` is the
 * network tip at the moment the gap was detected. `status` is `open` until
 * the backfill worker has replayed every ledger in the range, then `closed`.
 */
export interface RetentionGap {
  id: number;
  gapStart: number;
  gapEnd: number;
  status: 'open' | 'closed';
  createdAt: number;
  closedAt: number | null;
}

/**
 * Persistence surface for retention gaps. Implemented by both the SQLite and
 * Postgres stores (see `db/eventStore.ts`) so a restart resumes the backfill
 * from the same rows regardless of replica mode.
 */
export interface RetentionGapStore {
  recordRetentionGap(gapStart: number, gapEnd: number): Promise<RetentionGap>;
  listOpenRetentionGaps(): Promise<RetentionGap[]>;
  closeRetentionGap(id: number): Promise<void>;
}

/**
 * Records a persistent gap row when the live RPC node reports that our
 * cursor predates its retention window (issue #1667). Replaces the previous
 * behaviour of only bumping `IndexerMetrics.recordRetentionWindowGap()` and
 * skipping forward — the gap is now durable so the backfill worker can fill
 * it, and `/health` can surface it to the frontend.
 *
 * The metric is still recorded for dashboards/alerting; the row is the
 * source of truth for recovery.
 */
export async function recordRetentionGap(
  store: RetentionGapStore,
  metrics: IndexerMetrics,
  gapStart: number,
  gapEnd: number,
): Promise<RetentionGap> {
  metrics.recordRetentionWindowGap();
  const gap = await store.recordRetentionGap(gapStart, gapEnd);
  logger.warn(
    { gapStart, gapEnd, gapId: gap.id },
    'retention window gap recorded; backfill required',
  );
  return gap;
}

/**
 * Backfill worker (issue #1667). Fills persisted retention gaps from the
 * configured archive source (`ARCHIVE_RPC_URL`) concurrently with live
 * polling. Only the elected leader runs it — see `leaderElection.ts` — so
 * multiple replicas do not duplicate archive traffic.
 *
 * Idempotency: every event is inserted via `EventStore.insertEvent`, which
 * is keyed on the stable `eventId` from `computeEventId` (ledger + topic +
 * value digest, or the RPC's own id). Re-running the backfill over the same
 * ledger range therefore produces no duplicate rows, and live consumers
 * never see duplicates.
 *
 * Cost: archive fetches are scoped to `CONTRACT_ID` only, so the archive
 * provider is never asked for unrelated contracts' events.
 */
export interface BackfillDeps {
  archive: RpcClient;
  store: RetentionGapStore & Pick<IndexerStore, 'insertEvent'>;
  metrics: IndexerMetrics;
  contractId: string;
  contractVersion: number;
  /** Max ledgers per archive getEvents call. Defaults to 1000. */
  pageSize?: number;
}

/**
 * Fills a single gap from the archive source. Returns the number of events
 * recovered. Safe to call repeatedly: inserts are idempotent on `eventId`.
 */
export async function backfillGap(
  deps: BackfillDeps,
  gap: RetentionGap,
): Promise<number> {
  const pageSize = deps.pageSize ?? 1000;
  let cursor = gap.gapStart;
  let recovered = 0;

  while (cursor <= gap.gapEnd) {
    const response = await deps.archive.getEvents({
      startLedger: cursor,
      filters: [{ type: 'contract', contractIds: [deps.contractId] }],
      limit: pageSize,
    });

    for (const raw of response.events) {
      if (raw.ledger < gap.gapStart || raw.ledger > gap.gapEnd) continue;
      const decoded = decodeEvent(raw, deps.contractVersion);
      await deps.store.insertEvent(decoded);
      recovered += 1;
    }

    const ledgersRemaining = Math.max(0, gap.gapEnd - cursor);
    deps.metrics.recordBackfillProgress(ledgersRemaining, recovered);

    // Advance past the last ledger we saw, or by the page size when the
    // archive returned no events for this window (empty ranges are valid).
    const lastLedger = response.events.reduce(
      (max, e) => (e.ledger > max ? e.ledger : max),
      cursor - 1,
    );
    const next = Math.max(lastLedger + 1, cursor + pageSize);
    if (next <= cursor) break;
    cursor = next;
  }

  await deps.store.closeRetentionGap(gap.id);
  deps.metrics.recordBackfillProgress(0, recovered);
  logger.info({ gapId: gap.id, recovered }, 'retention gap backfilled');
  return recovered;
}

/**
 * Drains every open gap. Intended to be called on a timer by the leader
 * alongside live polling. Errors on one gap are logged and the gap is left
 * open so the next tick retries it.
 */
export async function runBackfill(deps: BackfillDeps): Promise<number> {
  const gaps = await deps.store.listOpenRetentionGaps();
  let total = 0;
  for (const gap of gaps) {
    try {
      total += await backfillGap(deps, gap);
    } catch (err) {
      logger.error({ err, gapId: gap.id }, 'retention gap backfill failed');
    }
  }
  return total;
}

/**
 * Starts the backfill worker on the elected leader only (issue #1667).
 * Returns a stop function. When `archive` is undefined (no
 * `ARCHIVE_RPC_URL`), the worker is a no-op and gaps stay open — visible in
 * `/health` and the frontend "history incomplete" badge.
 */
export function startBackfillWorker(
  deps: BackfillDeps | undefined,
  elector: LeaderElector,
  intervalMs: number,
): () => void {
  if (!deps) return () => {};
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      if (!(await elector.isLeader())) return;
      await runBackfill(deps);
    } catch (err) {
      logger.error({ err }, 'backfill worker tick failed');
    }
  };

  timer = setInterval(() => void tick(), intervalMs);
  void tick();

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}
