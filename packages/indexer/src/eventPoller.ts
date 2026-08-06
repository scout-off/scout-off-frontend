import { SorobanRpc, Networks, xdr, scValToNative } from '@stellar/stellar-sdk';
import { IndexerMetrics, type EventType } from './metrics/IndexerMetrics';
import { updateLastLedger, updateNetworkLedger } from './ledgerTracker';
import { EventStore } from './db/eventStore';

/**
 * Polls Soroban RPC's getEvents for new ScoutOff contract events and feeds
 * them into ledgerTracker and IndexerMetrics — the module described but
 * never implemented in README.md's "Event Listener / Poller" section.
 *
 * Config (env vars, all per README.md):
 *   SOROBAN_RPC_URL, CONTRACT_ID (required)
 *   NETWORK_PASSPHRASE, POLL_INTERVAL_MS, START_LEDGER (optional, defaulted)
 */

export const EVENT_TYPES: readonly EventType[] = [
  'player_registered',
  'milestone_approved',
  'milestone_revoked',
  'scout_subscribed',
  'player_contacted',
  'trial_offer_logged',
  'fees_withdrawn',
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
}

export interface DecodedEvent {
  type: EventType;
  ledger: number;
  timestamp: number;
  data: Record<string, unknown>;
}

export function createRpcClient(config: PollerConfig): RpcClient {
  const allowHttp = new URL(config.rpcUrl).protocol === 'http:';
  return new SorobanRpc.Server(config.rpcUrl, {
    allowHttp,
  }) as unknown as RpcClient;
}

/**
 * Decodes a raw Soroban contract event into one of the 7 documented event
 * types (README.md's "Indexed Event Schema").
 *
 * ASSUMPTION — no Rust contract source lives in this repository to confirm
 * the wire format against, so this assumes the common Soroban convention:
 * `topic[0]` is a Symbol equal to the event name (e.g. `"player_registered"`),
 * and `value` is a Map/struct ScVal holding the event's other documented
 * fields. `ledger`/`timestamp` come from the RPC envelope rather than the
 * decoded payload, since the README lists identical `ledger`/`timestamp`
 * fields across all 7 event types — those are naturally available from
 * every event's envelope regardless of what the contract encodes.
 *
 * If the actual contract encodes events differently, only this function
 * needs to change: the polling loop, ledger tracking, and metrics below are
 * decode-shape-agnostic.
 */
export function decodeEvent(raw: RawEvent): DecodedEvent {
  if (!raw.topic || raw.topic.length === 0) {
    throw new Error('Event has no topic; cannot determine event type');
  }

  const name = scValToNative(raw.topic[0]);
  if (!isEventType(name)) {
    throw new Error(`Unrecognized event type: ${String(name)}`);
  }

  const payload = raw.value ? scValToNative(raw.value) : {};
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`Event "${name}" payload did not decode to an object`);
  }

  const timestamp = Math.floor(new Date(raw.ledgerClosedAt).getTime() / 1000);

  return {
    type: name,
    ledger: raw.ledger,
    timestamp,
    data: { ...payload, ledger: raw.ledger, timestamp },
  };
}

/**
 * Fetches and processes one batch of events starting at `cursorLedger`
 * (or the current network tip, if `cursorLedger` is 0 — START_LEDGER's
 * documented "0 = latest" semantics). Returns the ledger to resume from on
 * the next call.
 *
 * Exported (in addition to startEventPolling) so tests can exercise a
 * single poll cycle directly against a mocked RpcClient, without needing
 * to drive setTimeout scheduling.
 */
export async function pollOnce(
  config: PollerConfig,
  rpc: RpcClient,
  metrics: IndexerMetrics,
  cursorLedger: number,
  store: EventStore,
): Promise<number> {
  const cycleStart = Date.now();

  try {
    const latest = await rpc.getLatestLedger();
    updateNetworkLedger(latest.sequence);

    const effectiveStart = cursorLedger > 0 ? cursorLedger : latest.sequence;
    const res = await rpc.getEvents({
      startLedger: effectiveStart,
      filters: [{ type: 'contract', contractIds: [config.contractId] }],
      limit: 100,
    });

    let nextCursor = cursorLedger > 0 ? cursorLedger : effectiveStart;

    for (const raw of res.events) {
      const eventStart = Date.now();
      try {
        const decoded = decodeEvent(raw);
        store.insertEvent(decoded);
        metrics.recordSuccess(
          decoded.type,
          Date.now() - eventStart,
          JSON.stringify(decoded.data).length,
        );
      } catch {
        // Malformed or unrecognized event from our own contract — a real
        // processing failure, not a transient RPC error, but still must
        // not stop the loop from advancing past it.
        metrics.recordFailure(Date.now() - eventStart);
      }

      if (raw.ledger >= nextCursor) {
        nextCursor = raw.ledger + 1;
      }
    }

    if (res.events.length === 0) {
      nextCursor = Math.max(nextCursor, res.latestLedger + 1);
    }

    updateLastLedger(Math.max(nextCursor - 1, 0));
    metrics.markHealthy();
    return nextCursor;
  } catch {
    // RPC-level failure (network error, bad startLedger outside the
    // node's retention window, etc.) — record it and retry the same
    // range on the next cycle rather than crashing the process.
    metrics.recordFailure(Date.now() - cycleStart);
    return cursorLedger;
  }
}

export interface EventPollerHandle {
  stop(): void;
}

/**
 * Starts the recurring poll loop on a POLL_INTERVAL_MS cadence. Each cycle
 * runs pollOnce and schedules the next one only after it settles, so a slow
 * or hanging RPC call can't cause overlapping cycles to pile up.
 */
export function startEventPolling(
  config: PollerConfig = loadConfigFromEnv(),
  rpc: RpcClient = createRpcClient(config),
  metrics: IndexerMetrics = IndexerMetrics.getInstance(),
  store: EventStore = EventStore.getInstance(),
): EventPollerHandle {
  let cursor = config.startLedger;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick(): Promise<void> {
    cursor = await pollOnce(config, rpc, metrics, cursor, store);
    if (!stopped) {
      timer = setTimeout(tick, config.pollIntervalMs);
    }
  }

  tick();

  return {
    stop(): void {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
