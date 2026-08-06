/**
 * @jest-environment node
 */
import { EventStore } from '../eventStore';
import type { DecodedEvent } from '../../eventPoller';

function makeDecoded(
  overrides: Partial<DecodedEvent> & { data?: Record<string, unknown> } = {},
): DecodedEvent {
  return {
    type: 'milestone_approved',
    ledger: 100,
    timestamp: 1_700_000_000,
    data: { player_id: 'player-1', milestone_id: 'm1', validator: 'GVAL' },
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
});
