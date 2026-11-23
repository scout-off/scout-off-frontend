/** @jest-environment node */
import {
  ReconciliationHistoryStore,
  mismatchKey,
} from '@/lib/reconciliationHistoryStore';
import type { ReconciliationMismatch } from '@/lib/adminAudit';

beforeEach(() => {
  ReconciliationHistoryStore.resetInstance();
});

afterEach(() => {
  ReconciliationHistoryStore.resetInstance();
});

const mismatch = (
  overrides: Partial<ReconciliationMismatch> = {},
): ReconciliationMismatch => ({
  actionType: 'validator_add',
  kind: 'missing_audit_entry',
  description: 'test mismatch',
  ...overrides,
});

describe('mismatchKey', () => {
  it('is stable for the same actionType/kind/target', () => {
    const a = mismatch({ target: 'GABC' });
    const b = mismatch({ target: 'GABC', description: 'different text' });
    expect(mismatchKey(a)).toBe(mismatchKey(b));
  });

  it('differs when target differs', () => {
    const a = mismatch({ target: 'GABC' });
    const b = mismatch({ target: 'GXYZ' });
    expect(mismatchKey(a)).not.toBe(mismatchKey(b));
  });
});

describe('ReconciliationHistoryStore', () => {
  it('returns null from getLatest when no run has ever been recorded', () => {
    expect(ReconciliationHistoryStore.getInstance().getLatest()).toBeNull();
  });

  it('persists a run and returns it from getLatest', () => {
    const store = ReconciliationHistoryStore.getInstance();
    const run = store.insertRun({
      checkedAt: 1_700_000_000,
      mismatches: [mismatch({ target: 'GABC' })],
      newMismatchCount: 1,
      skipped: [],
    });

    expect(run.id).toBeGreaterThan(0);
    const latest = store.getLatest();
    expect(latest?.checkedAt).toBe(1_700_000_000);
    expect(latest?.mismatches).toHaveLength(1);
    expect(latest?.newMismatchCount).toBe(1);
  });

  it('lists runs newest first', () => {
    const store = ReconciliationHistoryStore.getInstance();
    store.insertRun({
      checkedAt: 1,
      mismatches: [],
      newMismatchCount: 0,
      skipped: [],
    });
    store.insertRun({
      checkedAt: 2,
      mismatches: [],
      newMismatchCount: 0,
      skipped: [],
    });
    store.insertRun({
      checkedAt: 3,
      mismatches: [],
      newMismatchCount: 0,
      skipped: [],
    });

    const runs = store.listRuns();
    expect(runs.map((r) => r.checkedAt)).toEqual([3, 2, 1]);
  });

  it('caps listRuns at the requested limit', () => {
    const store = ReconciliationHistoryStore.getInstance();
    for (let i = 0; i < 5; i++) {
      store.insertRun({
        checkedAt: i,
        mismatches: [],
        newMismatchCount: 0,
        skipped: [],
      });
    }
    expect(store.listRuns(2)).toHaveLength(2);
  });

  it('round-trips mismatches and skipped sections through JSON storage', () => {
    const store = ReconciliationHistoryStore.getInstance();
    store.insertRun({
      checkedAt: 100,
      mismatches: [mismatch({ target: 'GABC' })],
      newMismatchCount: 1,
      skipped: ['fee_withdrawal: indexer unavailable'],
    });

    const latest = store.getLatest();
    expect(latest?.mismatches[0]).toMatchObject({
      actionType: 'validator_add',
      target: 'GABC',
    });
    expect(latest?.skipped).toEqual(['fee_withdrawal: indexer unavailable']);
  });
});
