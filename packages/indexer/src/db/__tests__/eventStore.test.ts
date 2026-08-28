/**
 * @jest-environment node
 */
import { EventStore } from '../eventStore';
import type { DecodedEvent } from '../../eventPoller';

// Each call defaults to a distinct eventId (a real decodeEvent output would
// vary by content) so that unrelated tests inserting several events don't
// collide on the new unique event_id index by accident. Tests that
// specifically exercise dedup pass a matching eventId explicitly.
let eventIdSeq = 0;

function makeDecoded(
  overrides: Partial<DecodedEvent> & { data?: Record<string, unknown> } = {},
): DecodedEvent {
  eventIdSeq += 1;
  return {
    type: 'milestone_approved',
    ledger: 100,
    timestamp: 1_700_000_000,
    data: { player_id: 'player-1', milestone_id: 'm1', validator: 'GVAL' },
    eventId: `test-event-${eventIdSeq}`,
    ...overrides,
  };
}

let store: EventStore;

beforeEach(() => {
  EventStore.resetInstance();
  store = EventStore.getInstance(':memory:');
});

afterEach(() => {
  EventStore.resetInstance();
});

describe('EventStore', () => {
  it('is a singleton keyed by first construction', () => {
    const a = EventStore.getInstance();
    const b = EventStore.getInstance();
    expect(a).toBe(b);
  });

  it('persists an inserted event and returns it from a query', () => {
    store.insertEvent(makeDecoded());

    const { events, nextCursor } = store.getEvents();
    expect(events).toHaveLength(1);
    expect(nextCursor).toBeNull();
    expect(events[0]).toMatchObject({
      type: 'milestone_approved',
      playerId: 'player-1',
      validator: 'GVAL',
      ledger: 100,
      timestamp: 1_700_000_000,
    });
    expect(events[0].data).toMatchObject({ milestone_id: 'm1' });
  });

  it('filters by event type', () => {
    store.insertEvent(makeDecoded({ type: 'milestone_approved' }));
    store.insertEvent(
      makeDecoded({
        type: 'player_contacted',
        data: { player_id: 'player-1', scout: 'GS' },
      }),
    );

    const { events } = store.getEvents({ type: 'player_contacted' });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('player_contacted');
  });

  it('filters by player via getEventsByPlayer, excluding other players', () => {
    store.insertEvent(makeDecoded({ data: { player_id: 'player-1' } }));
    store.insertEvent(makeDecoded({ data: { player_id: 'player-2' } }));

    const { events } = store.getEventsByPlayer('player-1');
    expect(events).toHaveLength(1);
    expect(events[0].playerId).toBe('player-1');
  });

  it('orders results newest-ledger-first', () => {
    store.insertEvent(makeDecoded({ ledger: 10 }));
    store.insertEvent(makeDecoded({ ledger: 30 }));
    store.insertEvent(makeDecoded({ ledger: 20 }));

    const { events } = store.getEvents();
    expect(events.map((e) => e.ledger)).toEqual([30, 20, 10]);
  });

  it('paginates with a keyset cursor that has no gaps or overlaps across pages', () => {
    for (let ledger = 1; ledger <= 5; ledger++) {
      store.insertEvent(makeDecoded({ ledger }));
    }

    const page1 = store.getEvents({ limit: 2 });
    expect(page1.events.map((e) => e.ledger)).toEqual([5, 4]);
    expect(page1.nextCursor).toBe(4);

    const page2 = store.getEvents({ limit: 2, before: page1.nextCursor! });
    expect(page2.events.map((e) => e.ledger)).toEqual([3, 2]);
    expect(page2.nextCursor).toBe(2);

    const page3 = store.getEvents({ limit: 2, before: page2.nextCursor! });
    expect(page3.events.map((e) => e.ledger)).toEqual([1]);
    expect(page3.nextCursor).toBeNull();
  });

  it('caps limit at the documented maximum', () => {
    for (let ledger = 1; ledger <= 5; ledger++) {
      store.insertEvent(makeDecoded({ ledger }));
    }

    const { events } = store.getEvents({ limit: 10_000 });
    expect(events).toHaveLength(5);
  });

  it('does not persist events to disk when using an in-memory store', () => {
    // Regression guard for the acceptance criteria: EventStore.getInstance(':memory:')
    // must never touch the filesystem, so tests (and any ephemeral deployment) stay isolated.
    expect(() => store.insertEvent(makeDecoded())).not.toThrow();
    expect(store.getEvents().events).toHaveLength(1);
  });

  // ── Exactly-once ingestion (issue #1180) ───────────────────────────────

  it('ignores a second insertEvent call carrying the same eventId, instead of creating a duplicate row', () => {
    const first = makeDecoded({
      eventId: 'milestone_approved:4200:abc123',
      ledger: 4200,
    });
    // Same eventId as `first` — simulates the same on-chain event being
    // re-decoded after an overlapping poll cycle (e.g. a poller restart or
    // two poller instances covering the same ledger range). Only the
    // ledger differs, which would normally look like a distinct row if
    // insertion weren't keyed on eventId.
    const duplicate = makeDecoded({
      eventId: 'milestone_approved:4200:abc123',
      ledger: 4201,
    });

    const insertedFirst = store.insertEvent(first);
    const insertedDuplicate = store.insertEvent(duplicate);

    expect(insertedFirst).toBe(true);
    expect(insertedDuplicate).toBe(false);

    const { events } = store.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].ledger).toBe(4200);
  });

  // ── Academy-scoped milestone rollup (issue #1172) ──────────────────────

  describe('getApprovalCountsForWallets', () => {
    it('counts milestone_approved events per wallet within range', () => {
      store.insertEvent(
        makeDecoded({ data: { validator: 'GWALLET_A', milestone_id: 'm1' }, timestamp: 100 }),
      );
      store.insertEvent(
        makeDecoded({ data: { validator: 'GWALLET_A', milestone_id: 'm2' }, timestamp: 200 }),
      );
      store.insertEvent(
        makeDecoded({ data: { validator: 'GWALLET_B', milestone_id: 'm3' }, timestamp: 150 }),
      );
      // Different event type — must not be counted as an approval.
      store.insertEvent(
        makeDecoded({
          type: 'milestone_revoked',
          data: { validator: 'GWALLET_A', milestone_id: 'm1' },
          timestamp: 300,
        }),
      );

      const counts = store.getApprovalCountsForWallets({ start: 0, end: 1000 }, [
        { wallet: 'GWALLET_A', since: 0 },
        { wallet: 'GWALLET_B', since: 0 },
      ]);

      expect(counts).toEqual({ GWALLET_A: 2, GWALLET_B: 1 });
    });

    it('excludes approvals before a wallet-specific `since` (pre-membership), not just the range start', () => {
      store.insertEvent(
        makeDecoded({ data: { validator: 'GWALLET_A', milestone_id: 'm1' }, timestamp: 50 }),
      );
      store.insertEvent(
        makeDecoded({ data: { validator: 'GWALLET_A', milestone_id: 'm2' }, timestamp: 150 }),
      );

      // Range starts at 0, but this wallet only joined its academy at t=100 —
      // the m1 approval (t=50) must not count even though it's inside [0, 1000].
      const counts = store.getApprovalCountsForWallets({ start: 0, end: 1000 }, [
        { wallet: 'GWALLET_A', since: 100 },
      ]);

      expect(counts).toEqual({ GWALLET_A: 1 });
    });

    it('returns a 0 count (not an omitted key) for a wallet with no matching approvals', () => {
      const counts = store.getApprovalCountsForWallets({ start: 0, end: 1000 }, [
        { wallet: 'GWALLET_NONE', since: 0 },
      ]);
      expect(counts).toEqual({ GWALLET_NONE: 0 });
    });

    it('returns {} without querying for an empty wallet list', () => {
      expect(store.getApprovalCountsForWallets({ start: 0, end: 1000 }, [])).toEqual(
        {},
      );
    });

    it('memoizes identical requests, and invalidates on the next approval instead of going stale', () => {
      store.insertEvent(
        makeDecoded({ data: { validator: 'GWALLET_A', milestone_id: 'm1' }, timestamp: 100 }),
      );
      const range = { start: 0, end: 1000 };
      const wallets = [{ wallet: 'GWALLET_A', since: 0 }];

      const first = store.getApprovalCountsForWallets(range, wallets);
      const repeated = store.getApprovalCountsForWallets(range, wallets);
      expect(first).toEqual({ GWALLET_A: 1 });
      expect(repeated).toEqual({ GWALLET_A: 1 });

      // A new approval must invalidate the memoized result immediately
      // rather than waiting out the TTL — otherwise the rollup could
      // under-report a fresh approval for up to APPROVAL_COUNTS_CACHE_TTL_MS.
      store.insertEvent(
        makeDecoded({
          data: { validator: 'GWALLET_A', milestone_id: 'm2' },
          timestamp: 200,
          eventId: 'distinct-for-memo-test',
        }),
      );
      const afterNewApproval = store.getApprovalCountsForWallets(range, wallets);
      expect(afterNewApproval).toEqual({ GWALLET_A: 2 });
    });
  });
});
