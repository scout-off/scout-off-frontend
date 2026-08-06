/**
 * @jest-environment node
 */
import {
  AdminAuditStore,
  type NewAdminAuditEntry,
} from '@/lib/adminAuditStore';

function makeEntry(
  overrides: Partial<NewAdminAuditEntry> = {},
): NewAdminAuditEntry {
  return {
    actionType: 'validator_add',
    adminWallet: 'GADMIN',
    target: 'GVAL1',
    status: 'submitted',
    timestamp: 1_700_000_000,
    ...overrides,
  };
}

let store: AdminAuditStore;

beforeEach(() => {
  AdminAuditStore.resetInstance();
  store = AdminAuditStore.getInstance(':memory:');
});

afterEach(() => {
  AdminAuditStore.resetInstance();
});

describe('AdminAuditStore', () => {
  it('is a singleton keyed by first construction', () => {
    const a = AdminAuditStore.getInstance();
    const b = AdminAuditStore.getInstance();
    expect(a).toBe(b);
  });

  it('persists an inserted entry and returns it from a query', () => {
    store.insertEntry(makeEntry());

    const { entries, nextCursor } = store.getEntries();
    expect(entries).toHaveLength(1);
    expect(nextCursor).toBeNull();
    expect(entries[0]).toMatchObject({
      actionType: 'validator_add',
      adminWallet: 'GADMIN',
      target: 'GVAL1',
      status: 'submitted',
      timestamp: 1_700_000_000,
    });
  });

  it('returns the newest-inserted entry first', () => {
    store.insertEntry(makeEntry({ timestamp: 1 }));
    store.insertEntry(makeEntry({ timestamp: 2 }));
    store.insertEntry(makeEntry({ timestamp: 3 }));

    const { entries } = store.getEntries();
    expect(entries.map((e) => e.timestamp)).toEqual([3, 2, 1]);
  });

  it('filters by actionType', () => {
    store.insertEntry(makeEntry({ actionType: 'validator_add' }));
    store.insertEntry(makeEntry({ actionType: 'pause', target: null }));

    const { entries } = store.getEntries({ actionType: 'pause' });
    expect(entries).toHaveLength(1);
    expect(entries[0].actionType).toBe('pause');
  });

  it('filters by from/to time range (inclusive)', () => {
    store.insertEntry(makeEntry({ timestamp: 100 }));
    store.insertEntry(makeEntry({ timestamp: 200 }));
    store.insertEntry(makeEntry({ timestamp: 300 }));

    const { entries } = store.getEntries({ from: 150, to: 250 });
    expect(entries.map((e) => e.timestamp)).toEqual([200]);
  });

  it('stores amountStroops and txHash for fee withdrawals', () => {
    store.insertEntry(
      makeEntry({
        actionType: 'fee_withdrawal',
        target: null,
        amountStroops: 12_345,
        txHash: 'abc123',
      }),
    );

    const { entries } = store.getEntries({ actionType: 'fee_withdrawal' });
    expect(entries[0].amountStroops).toBe(12_345);
    expect(entries[0].txHash).toBe('abc123');
  });

  it('stores arbitrary extra data as JSON', () => {
    store.insertEntry(makeEntry({ data: { reason: 'quarterly cleanup' } }));
    const { entries } = store.getEntries();
    expect(entries[0].data).toEqual({ reason: 'quarterly cleanup' });
  });

  it('paginates with a keyset cursor', () => {
    for (let i = 0; i < 5; i++) {
      store.insertEntry(makeEntry({ timestamp: i }));
    }

    const page1 = store.getEntries({ limit: 2 });
    expect(page1.entries).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = store.getEntries({ limit: 2, before: page1.nextCursor! });
    expect(page2.entries).toHaveLength(2);
    expect(page2.entries[0].id).toBeLessThan(page1.entries[1].id);
  });

  it('getAllByActionTypeOldestFirst replays validator add/remove in chronological order', () => {
    store.insertEntry(
      makeEntry({ actionType: 'validator_add', target: 'GA', timestamp: 2 }),
    );
    store.insertEntry(
      makeEntry({ actionType: 'validator_add', target: 'GB', timestamp: 1 }),
    );
    store.insertEntry(
      makeEntry({ actionType: 'validator_remove', target: 'GA', timestamp: 3 }),
    );

    const replay = store.getAllByActionTypeOldestFirst([
      'validator_add',
      'validator_remove',
    ]);
    expect(replay.map((e) => [e.actionType, e.target])).toEqual([
      ['validator_add', 'GB'],
      ['validator_add', 'GA'],
      ['validator_remove', 'GA'],
    ]);
  });

  it('getAllByActionTypeOldestFirst returns an empty array for an empty type list', () => {
    expect(store.getAllByActionTypeOldestFirst([])).toEqual([]);
  });
});
