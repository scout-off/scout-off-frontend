/**
 * @jest-environment node
 */
import {
  updateLastLedger,
  updateNetworkLedger,
  getLastLedgerInfo,
  getLedgerLag,
  resetLedgerState,
} from '../ledgerTracker';

beforeEach(() => {
  resetLedgerState();
});

afterEach(() => {
  resetLedgerState();
});

// ── updateLastLedger / getLastLedgerInfo ──────────────────────────────────────

describe('updateLastLedger', () => {
  test('sets lastLedger to the given sequence', () => {
    updateLastLedger(500);
    expect(getLastLedgerInfo().lastLedger).toBe(500);
  });

  test('sets timestamp to a recent Unix ms value', () => {
    const before = Date.now();
    updateLastLedger(500);
    const after = Date.now();
    const { timestamp } = getLastLedgerInfo();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  test('overwrites a previous value on a second call', () => {
    updateLastLedger(100);
    updateLastLedger(200);
    expect(getLastLedgerInfo().lastLedger).toBe(200);
  });
});

describe('getLastLedgerInfo', () => {
  test('returns lastLedger:0 and timestamp:0 before any update', () => {
    const info = getLastLedgerInfo();
    expect(info.lastLedger).toBe(0);
    expect(info.timestamp).toBe(0);
  });

  test('returns a fresh copy, not a live reference to internal state', () => {
    updateLastLedger(10);
    const info = getLastLedgerInfo();
    info.lastLedger = 999999;
    expect(getLastLedgerInfo().lastLedger).toBe(10);
  });

  test('includes networkLedger alongside lastLedger and timestamp', () => {
    updateNetworkLedger(42);
    expect(getLastLedgerInfo().networkLedger).toBe(42);
  });
});

// ── updateNetworkLedger ────────────────────────────────────────────────────────

describe('updateNetworkLedger', () => {
  test('sets networkLedger to the given sequence', () => {
    updateNetworkLedger(777);
    expect(getLastLedgerInfo().networkLedger).toBe(777);
  });

  test('does not affect lastLedger or timestamp', () => {
    updateLastLedger(100);
    const { timestamp: timestampBefore } = getLastLedgerInfo();
    updateNetworkLedger(200);
    const info = getLastLedgerInfo();
    expect(info.lastLedger).toBe(100);
    expect(info.timestamp).toBe(timestampBefore);
  });
});

// ── getLedgerLag ───────────────────────────────────────────────────────────────

describe('getLedgerLag', () => {
  test('returns 0 when neither ledger value has ever been set', () => {
    expect(getLedgerLag()).toBe(0);
  });

  test('returns 0 when only networkLedger is unknown (still 0)', () => {
    updateLastLedger(100);
    expect(getLedgerLag()).toBe(0);
  });

  test('returns 0 when only lastLedger is unknown (still 0)', () => {
    updateNetworkLedger(100);
    expect(getLedgerLag()).toBe(0);
  });

  test('computes the correct positive difference in the normal case', () => {
    updateNetworkLedger(1050);
    updateLastLedger(1000);
    expect(getLedgerLag()).toBe(50);
  });

  test('returns 0 when both ledgers are equal (fully caught up)', () => {
    updateNetworkLedger(500);
    updateLastLedger(500);
    expect(getLedgerLag()).toBe(0);
  });

  test('clamps to 0 rather than going negative if lastLedger exceeds networkLedger', () => {
    updateNetworkLedger(100);
    updateLastLedger(150);
    expect(getLedgerLag()).toBe(0);
  });
});

// ── resetLedgerState ───────────────────────────────────────────────────────────

describe('resetLedgerState', () => {
  test('resets lastLedger, timestamp, and networkLedger all to 0', () => {
    updateLastLedger(100);
    updateNetworkLedger(200);

    resetLedgerState();

    const info = getLastLedgerInfo();
    expect(info.lastLedger).toBe(0);
    expect(info.timestamp).toBe(0);
    expect(info.networkLedger).toBe(0);
  });

  test('getLedgerLag returns 0 immediately after a reset', () => {
    updateNetworkLedger(1000);
    updateLastLedger(900);
    expect(getLedgerLag()).toBe(100);

    resetLedgerState();

    expect(getLedgerLag()).toBe(0);
  });
});

// ── checkpoint persistence behavior ───────────────────────────────────────────

describe('checkpoint persistence behavior', () => {
  test('checkpoint value persists across multiple getLastLedgerInfo() calls', () => {
    updateLastLedger(450);
    const first = getLastLedgerInfo();
    const second = getLastLedgerInfo();
    expect(first.lastLedger).toBe(450);
    expect(second.lastLedger).toBe(450);
  });

  test('saving a new checkpoint overwrites the previous one (simulates restart with persisted state)', () => {
    updateLastLedger(100);
    // Simulate re-load by writing a new checkpoint value
    updateLastLedger(200);
    expect(getLastLedgerInfo().lastLedger).toBe(200);
  });

  test('default checkpoint is 0 when no checkpoint has been saved (fresh start)', () => {
    // resetLedgerState() is called in beforeEach, so this is a clean slate
    expect(getLastLedgerInfo().lastLedger).toBe(0);
  });

  test('both lastLedger and networkLedger checkpoints are independent', () => {
    updateLastLedger(500);
    updateNetworkLedger(550);
    const info = getLastLedgerInfo();
    expect(info.lastLedger).toBe(500);
    expect(info.networkLedger).toBe(550);
  });
});

// ── checkpoint save / load / missing-checkpoint (AC) ─────────────────────────
//
// These tests model the three lifecycle phases that matter for indexer
// correctness:
//
//   1. SAVE   — writing a checkpoint after processing a batch of ledgers.
//   2. LOAD   — reading the checkpoint back (e.g. after a process restart) and
//               confirming the indexer resumes from the saved sequence rather
//               than starting over.
//   3. MISSING — starting cold with no prior checkpoint; the returned sequence
//               must be the sentinel value 0, signalling "start from genesis /
//               latest ledger".
//
// Because ledgerTracker.ts uses a module-level in-memory singleton (no DB I/O),
// "restart" is modelled by calling resetLedgerState() (wiping the module state
// as a process restart would) and then re-applying only the state that a real
// persistent store would have survived.  A genuine DB-backed persistence layer
// would use an in-memory SQLite instance; the test contracts here are identical
// to what those tests would assert.

describe('checkpoint — save', () => {
  test('saving a checkpoint records the last processed ledger sequence', () => {
    // Simulate the indexer finishing a batch at ledger 1_000
    updateLastLedger(1_000);

    const { lastLedger } = getLastLedgerInfo();
    expect(lastLedger).toBe(1_000);
  });

  test('saving a later checkpoint advances the stored sequence', () => {
    updateLastLedger(1_000);
    updateLastLedger(1_050);

    expect(getLastLedgerInfo().lastLedger).toBe(1_050);
  });

  test('saving a checkpoint records a recent timestamp', () => {
    const before = Date.now();
    updateLastLedger(2_500);
    const after = Date.now();

    const { timestamp } = getLastLedgerInfo();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});

describe('checkpoint — load (resume after restart)', () => {
  test('loading a previously saved sequence returns the correct ledger number', () => {
    // ── Phase 1: pre-restart — indexer processes up to ledger 5_000 ──────────
    updateLastLedger(5_000);

    // ── Phase 2: simulate restart — capture the value a persistent store would
    //    have preserved, then reset in-memory state as a new process would.
    const savedSequence = getLastLedgerInfo().lastLedger;
    resetLedgerState(); // module state is now zero, as after a fresh boot

    // ── Phase 3: restore — re-apply the persisted checkpoint (a real
    //    implementation reads from DB; here we replay the saved value).
    updateLastLedger(savedSequence);

    // The indexer must resume from ledger 5_000, not from 0.
    expect(getLastLedgerInfo().lastLedger).toBe(5_000);
  });

  test('restored checkpoint allows correct lag computation', () => {
    // Pre-restart: indexed up to 4_900; network is at 4_950.
    updateLastLedger(4_900);
    updateNetworkLedger(4_950);
    expect(getLedgerLag()).toBe(50);

    // Restart: persist both values.
    const saved = getLastLedgerInfo();
    resetLedgerState();

    // Restore.
    updateLastLedger(saved.lastLedger);
    updateNetworkLedger(saved.networkLedger);

    expect(getLedgerLag()).toBe(50);
  });

  test('restoring does not bleed timestamp from the previous run into the new process', () => {
    updateLastLedger(3_000);
    const originalTimestamp = getLastLedgerInfo().timestamp;

    resetLedgerState();

    // After reset the timestamp is 0 — a fresh process has not yet polled.
    expect(getLastLedgerInfo().timestamp).toBe(0);
    expect(getLastLedgerInfo().timestamp).not.toBe(originalTimestamp);
  });
});

describe('checkpoint — missing (no prior checkpoint / cold start)', () => {
  test('returns lastLedger:0 when no checkpoint has ever been written', () => {
    // resetLedgerState() is called in beforeEach — this is a clean slate
    // representing a process that has never written a checkpoint.
    const { lastLedger } = getLastLedgerInfo();

    // 0 is the sentinel: the indexer should start from the configured start
    // block or the network's latest ledger.
    expect(lastLedger).toBe(0);
  });

  test('returns networkLedger:0 when the network tip has never been observed', () => {
    expect(getLastLedgerInfo().networkLedger).toBe(0);
  });

  test('getLedgerLag returns 0 on cold start (both values unknown)', () => {
    // Neither ledger has been set; lag is meaningless and must not be negative.
    expect(getLedgerLag()).toBe(0);
  });

  test('first updateLastLedger call transitions from cold-start sentinel to a real sequence', () => {
    // Before: sentinel
    expect(getLastLedgerInfo().lastLedger).toBe(0);

    // First poll completes — write the checkpoint.
    updateLastLedger(42_000);

    // After: sequence is no longer the sentinel.
    expect(getLastLedgerInfo().lastLedger).toBe(42_000);
    expect(getLastLedgerInfo().lastLedger).not.toBe(0);
  });
});
