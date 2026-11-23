/**
 * @jest-environment node
 *
 * Unit tests for lib/recentlyViewedStore.ts — SQLite-backed persistence for
 * scouts' recently-viewed players. Mirrors __tests__/lib/watchlistStore.test.ts:
 * openSqliteDb resolves to an in-memory DB under NODE_ENV=test, so the real
 * (unmocked) store code runs against a working SQLite instance.
 */
import { RecentlyViewedStore, MAX_ENTRIES } from '@/lib/recentlyViewedStore';

let store: RecentlyViewedStore;

beforeEach(() => {
  RecentlyViewedStore.resetInstance();
  store = RecentlyViewedStore.getInstance();
});

afterEach(() => {
  RecentlyViewedStore.resetInstance();
});

describe('RecentlyViewedStore', () => {
  it('is a singleton', () => {
    expect(RecentlyViewedStore.getInstance()).toBe(
      RecentlyViewedStore.getInstance(),
    );
  });

  it('resetInstance replaces the singleton', () => {
    const first = RecentlyViewedStore.getInstance();
    RecentlyViewedStore.resetInstance();
    expect(RecentlyViewedStore.getInstance()).not.toBe(first);
  });

  it('exposes the capacity cap', () => {
    expect(MAX_ENTRIES).toBe(50);
  });

  it('records a view and returns the stored entry', () => {
    const entry = store.record('GSCOUT', 'PLAYER-1', 1000);
    expect(entry).toMatchObject({ playerId: 'PLAYER-1', viewedAt: 1000 });
    expect(typeof entry.id).toBe('number');
  });

  it('lists entries newest first', () => {
    store.record('GSCOUT', 'PLAYER-1', 1000);
    store.record('GSCOUT', 'PLAYER-2', 2000);
    store.record('GSCOUT', 'PLAYER-3', 3000);

    expect(store.list('GSCOUT').map((e) => e.playerId)).toEqual([
      'PLAYER-3',
      'PLAYER-2',
      'PLAYER-1',
    ]);
  });

  it('deduplicates a re-viewed player, moving it to the front', () => {
    store.record('GSCOUT', 'PLAYER-1', 1000);
    store.record('GSCOUT', 'PLAYER-2', 2000);
    store.record('GSCOUT', 'PLAYER-1', 3000);

    const entries = store.list('GSCOUT');
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.playerId)).toEqual(['PLAYER-1', 'PLAYER-2']);
  });

  it('scopes entries per scout wallet', () => {
    store.record('GSCOUT_A', 'PLAYER-1', 1000);
    store.record('GSCOUT_B', 'PLAYER-2', 2000);

    expect(store.list('GSCOUT_A').map((e) => e.playerId)).toEqual(['PLAYER-1']);
    expect(store.list('GSCOUT_B').map((e) => e.playerId)).toEqual(['PLAYER-2']);
  });

  it('removes an entry by player id', () => {
    store.record('GSCOUT', 'PLAYER-1', 1000);
    expect(store.removeByPlayerId('GSCOUT', 'PLAYER-1')).toBe(true);
    expect(store.removeByPlayerId('GSCOUT', 'PLAYER-1')).toBe(false);
    expect(store.list('GSCOUT')).toHaveLength(0);
  });

  it('removes an entry by database id, scoped to the owning wallet', () => {
    const entry = store.record('GSCOUT', 'PLAYER-1', 1000);
    expect(store.remove('GSOMEONE_ELSE', entry.id!)).toBe(false);
    expect(store.remove('GSCOUT', entry.id!)).toBe(true);
    expect(store.list('GSCOUT')).toHaveLength(0);
  });

  it('clears all entries for a wallet and reports the count removed', () => {
    store.record('GSCOUT', 'PLAYER-1', 1000);
    store.record('GSCOUT', 'PLAYER-2', 2000);
    store.record('GOTHER', 'PLAYER-3', 3000);

    expect(store.clearForWallet('GSCOUT')).toBe(2);
    expect(store.list('GSCOUT')).toHaveLength(0);
    expect(store.list('GOTHER')).toHaveLength(1);
  });

  it('caps stored entries at MAX_ENTRIES, dropping the oldest', () => {
    for (let i = 1; i <= MAX_ENTRIES + 5; i++) {
      store.record('GSCOUT', `PLAYER-${i}`, i * 1000);
    }

    const entries = store.list('GSCOUT');
    expect(entries).toHaveLength(MAX_ENTRIES);
    expect(entries[0].playerId).toBe(`PLAYER-${MAX_ENTRIES + 5}`);
    expect(entries.some((e) => e.playerId === 'PLAYER-1')).toBe(false);
  });

  it('close() releases the underlying connection', () => {
    expect(() => store.close()).not.toThrow();
  });
});
