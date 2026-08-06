/**
 * @jest-environment node
 */
import { nativeToScVal } from '@stellar/stellar-sdk';
import {
  decodeEvent,
  pollOnce,
  startEventPolling,
  loadConfigFromEnv,
  type PollerConfig,
  type RpcClient,
  type RawEvent,
} from '../eventPoller';
import { IndexerMetrics } from '../metrics/IndexerMetrics';
import { getLastLedgerInfo, resetLedgerState } from '../ledgerTracker';
import { EventStore } from '../db/eventStore';

const CONTRACT_ID = 'CABCDEF1234567890CONTRACTID1234567890XXXXXXXXXXXXXXXX';

function makeRawEvent(
  eventName: string,
  fields: Record<string, unknown>,
  overrides: Partial<RawEvent> = {},
): RawEvent {
  return {
    ledger: 1000,
    ledgerClosedAt: new Date(1_700_000_000 * 1000).toISOString(),
    topic: [nativeToScVal(eventName, { type: 'symbol' })],
    value: nativeToScVal(fields),
    ...overrides,
  };
}

function baseConfig(overrides: Partial<PollerConfig> = {}): PollerConfig {
  return {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    contractId: CONTRACT_ID,
    networkPassphrase: 'Test SDF Network ; September 2015',
    pollIntervalMs: 5000,
    startLedger: 0,
    ...overrides,
  };
}

let store: EventStore;

beforeEach(() => {
  IndexerMetrics.resetInstance();
  resetLedgerState();
  EventStore.resetInstance();
  store = EventStore.getInstance(':memory:');
});

afterEach(() => {
  IndexerMetrics.resetInstance();
  resetLedgerState();
  EventStore.resetInstance();
  jest.useRealTimers();
});

// ── decodeEvent ────────────────────────────────────────────────────────────────

describe('decodeEvent', () => {
  it('decodes a well-formed event into its type, ledger, timestamp, and data', () => {
    const raw = makeRawEvent(
      'player_registered',
      { player_id: 'p1', wallet: 'GABC', ipfs_hash: 'Qm123' },
      {
        ledger: 42,
        ledgerClosedAt: new Date(1_700_000_000 * 1000).toISOString(),
      },
    );

    const decoded = decodeEvent(raw);

    expect(decoded.type).toBe('player_registered');
    expect(decoded.ledger).toBe(42);
    expect(decoded.timestamp).toBe(1_700_000_000);
    expect(decoded.data).toMatchObject({
      player_id: 'p1',
      wallet: 'GABC',
      ipfs_hash: 'Qm123',
    });
  });

  it('decodes every one of the 7 documented event types', () => {
    const names = [
      'player_registered',
      'milestone_approved',
      'milestone_revoked',
      'scout_subscribed',
      'player_contacted',
      'trial_offer_logged',
      'fees_withdrawn',
    ];
    for (const name of names) {
      const decoded = decodeEvent(makeRawEvent(name, { some_field: 'x' }));
      expect(decoded.type).toBe(name);
    }
  });

  it('throws for an event with no topic', () => {
    const raw = makeRawEvent('player_registered', {});
    raw.topic = [];
    expect(() => decodeEvent(raw)).toThrow(/no topic/i);
  });

  it('throws for an unrecognized event type', () => {
    const raw = makeRawEvent('some_future_event', { x: 1 });
    expect(() => decodeEvent(raw)).toThrow(/unrecognized event type/i);
  });
});

// ── pollOnce ──────────────────────────────────────────────────────────────────

describe('pollOnce', () => {
  it('starts from the network tip when cursorLedger is 0 (START_LEDGER=0 = latest)', async () => {
    const rpc: jest.Mocked<RpcClient> = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 5000 }),
      getEvents: jest
        .fn()
        .mockResolvedValue({ latestLedger: 5000, events: [] }),
    };
    const metrics = IndexerMetrics.getInstance();

    await pollOnce(baseConfig(), rpc, metrics, 0, store);

    expect(rpc.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({ startLedger: 5000 }),
    );
  });

  it('records a decoded event via IndexerMetrics.recordSuccess and advances the ledger cursor past it', async () => {
    const raw = makeRawEvent(
      'player_contacted',
      { scout: 'G1', player_id: 'p1' },
      {
        ledger: 1234,
      },
    );
    const rpc: jest.Mocked<RpcClient> = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1234 }),
      getEvents: jest
        .fn()
        .mockResolvedValue({ latestLedger: 1234, events: [raw] }),
    };
    const metrics = IndexerMetrics.getInstance();
    const recordSuccessSpy = jest.spyOn(metrics, 'recordSuccess');

    const nextCursor = await pollOnce(baseConfig(), rpc, metrics, 1200, store);

    expect(recordSuccessSpy).toHaveBeenCalledWith(
      'player_contacted',
      expect.any(Number),
      expect.any(Number),
    );
    expect(nextCursor).toBe(1235);
    expect(getLastLedgerInfo().lastLedger).toBe(1234);

    const { events } = store.getEvents({ type: 'player_contacted' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'player_contacted',
      playerId: 'p1',
      scout: 'G1',
      ledger: 1234,
    });
  });

  it('does not persist an event that failed to decode', async () => {
    const badRaw = makeRawEvent('not_a_real_event', {}, { ledger: 777 });
    const rpc: jest.Mocked<RpcClient> = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 777 }),
      getEvents: jest
        .fn()
        .mockResolvedValue({ latestLedger: 777, events: [badRaw] }),
    };
    const metrics = IndexerMetrics.getInstance();

    await pollOnce(baseConfig(), rpc, metrics, 700, store);

    expect(store.getEvents().events).toHaveLength(0);
  });

  it('calls updateNetworkLedger with the RPC-reported network tip even while behind it', async () => {
    const rpc: jest.Mocked<RpcClient> = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 9999 }),
      getEvents: jest
        .fn()
        .mockResolvedValue({ latestLedger: 9999, events: [] }),
    };
    const metrics = IndexerMetrics.getInstance();

    await pollOnce(baseConfig(), rpc, metrics, 9500, store);

    expect(getLastLedgerInfo().networkLedger).toBe(9999);
  });

  it('advances the cursor to latestLedger + 1 when no events are found', async () => {
    const rpc: jest.Mocked<RpcClient> = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 500 }),
      getEvents: jest.fn().mockResolvedValue({ latestLedger: 500, events: [] }),
    };
    const metrics = IndexerMetrics.getInstance();

    const nextCursor = await pollOnce(baseConfig(), rpc, metrics, 100, store);

    expect(nextCursor).toBe(501);
  });

  it('records a decode failure but still advances past the bad event', async () => {
    const badRaw = makeRawEvent('not_a_real_event', {}, { ledger: 777 });
    const rpc: jest.Mocked<RpcClient> = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 777 }),
      getEvents: jest
        .fn()
        .mockResolvedValue({ latestLedger: 777, events: [badRaw] }),
    };
    const metrics = IndexerMetrics.getInstance();
    const recordFailureSpy = jest.spyOn(metrics, 'recordFailure');

    const nextCursor = await pollOnce(baseConfig(), rpc, metrics, 700, store);

    expect(recordFailureSpy).toHaveBeenCalled();
    expect(nextCursor).toBe(778);
  });

  it('records an RPC-level failure, leaves the cursor unchanged, and does not throw', async () => {
    const rpc: jest.Mocked<RpcClient> = {
      getLatestLedger: jest
        .fn()
        .mockRejectedValue(new Error('RPC unreachable')),
      getEvents: jest.fn(),
    };
    const metrics = IndexerMetrics.getInstance();
    const recordFailureSpy = jest.spyOn(metrics, 'recordFailure');

    const nextCursor = await pollOnce(baseConfig(), rpc, metrics, 42, store);

    expect(recordFailureSpy).toHaveBeenCalled();
    expect(nextCursor).toBe(42);
    expect(rpc.getEvents).not.toHaveBeenCalled();
  });

  it('records an RPC-level failure when getEvents itself rejects', async () => {
    const rpc: jest.Mocked<RpcClient> = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
      getEvents: jest.fn().mockRejectedValue(new Error('bad startLedger')),
    };
    const metrics = IndexerMetrics.getInstance();
    const recordFailureSpy = jest.spyOn(metrics, 'recordFailure');

    const nextCursor = await pollOnce(baseConfig(), rpc, metrics, 42, store);

    expect(recordFailureSpy).toHaveBeenCalled();
    expect(nextCursor).toBe(42);
  });

  it('marks the indexer healthy again after a successful cycle', async () => {
    const rpc: jest.Mocked<RpcClient> = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 10 }),
      getEvents: jest.fn().mockResolvedValue({ latestLedger: 10, events: [] }),
    };
    const metrics = IndexerMetrics.getInstance();
    for (let i = 0; i < 5; i++) metrics.recordFailure(1);
    expect(metrics.snapshot().isHealthy).toBe(false);

    await pollOnce(baseConfig(), rpc, metrics, 0, store);

    expect(metrics.snapshot().isHealthy).toBe(true);
  });
});

// ── startEventPolling ─────────────────────────────────────────────────────────

describe('startEventPolling', () => {
  it('polls repeatedly on the configured interval until stopped', async () => {
    jest.useFakeTimers();
    const rpc: jest.Mocked<RpcClient> = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1 }),
      getEvents: jest.fn().mockResolvedValue({ latestLedger: 1, events: [] }),
    };
    const metrics = IndexerMetrics.getInstance();

    const handle = startEventPolling(
      baseConfig({ pollIntervalMs: 1000 }),
      rpc,
      metrics,
    );

    // The first cycle starts synchronously but resolves through a couple of
    // awaited mock promises; advancing by 0ms flushes fake timers *and*
    // pending microtasks without depending on how many hops that takes.
    await jest.advanceTimersByTimeAsync(0);
    expect(rpc.getEvents).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(rpc.getEvents).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(1000);
    expect(rpc.getEvents).toHaveBeenCalledTimes(3);

    handle.stop();
    await jest.advanceTimersByTimeAsync(5000);
    expect(rpc.getEvents).toHaveBeenCalledTimes(3);
  });
});

// ── loadConfigFromEnv ─────────────────────────────────────────────────────────

describe('loadConfigFromEnv', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('throws when SOROBAN_RPC_URL is missing', () => {
    delete process.env.SOROBAN_RPC_URL;
    process.env.CONTRACT_ID = CONTRACT_ID;
    expect(() => loadConfigFromEnv()).toThrow(/SOROBAN_RPC_URL/);
  });

  it('throws when CONTRACT_ID is missing', () => {
    process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
    delete process.env.CONTRACT_ID;
    expect(() => loadConfigFromEnv()).toThrow(/CONTRACT_ID/);
  });

  it('applies documented defaults for the optional vars', () => {
    process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
    process.env.CONTRACT_ID = CONTRACT_ID;
    delete process.env.NETWORK_PASSPHRASE;
    delete process.env.POLL_INTERVAL_MS;
    delete process.env.START_LEDGER;

    const config = loadConfigFromEnv();

    expect(config.pollIntervalMs).toBe(5000);
    expect(config.startLedger).toBe(0);
    expect(config.networkPassphrase).toMatch(/Test SDF Network/);
  });

  it('reads explicit overrides for the optional vars', () => {
    process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
    process.env.CONTRACT_ID = CONTRACT_ID;
    process.env.NETWORK_PASSPHRASE =
      'Public Global Stellar Network ; September 2015';
    process.env.POLL_INTERVAL_MS = '10000';
    process.env.START_LEDGER = '123456';

    const config = loadConfigFromEnv();

    expect(config.pollIntervalMs).toBe(10000);
    expect(config.startLedger).toBe(123456);
    expect(config.networkPassphrase).toBe(
      'Public Global Stellar Network ; September 2015',
    );
  });
});
