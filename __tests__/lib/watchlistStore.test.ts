/**
 * @jest-environment node
 */
import { WatchlistStore } from '@/lib/watchlistStore';

let store: WatchlistStore;

beforeEach(() => {
  WatchlistStore.resetInstance();
  store = WatchlistStore.getInstance();
});

afterEach(() => {
  WatchlistStore.resetInstance();
});

describe('WatchlistStore', () => {
  it('is a singleton', () => {
    const a = WatchlistStore.getInstance();
    const b = WatchlistStore.getInstance();
    expect(a).toBe(b);
  });

  it('adds and lists entries for a scout, newest first', () => {
    store.add('GSCOUT', 'player-1');
    store.add('GSCOUT', 'player-2');

    const entries = store.list('GSCOUT');
    expect(entries.map((e) => e.playerId)).toEqual(['player-2', 'player-1']);
    expect(entries[0]).toMatchObject({
      scoutWallet: 'GSCOUT',
      playerId: 'player-2',
    });
  });

  it('does not duplicate an entry for the same scout/player pair', () => {
    store.add('GSCOUT', 'player-1');
    const second = store.add('GSCOUT', 'player-1');

    const entries = store.list('GSCOUT');
    expect(entries).toHaveLength(1);
    expect(second.playerId).toBe('player-1');
  });

  it('scopes lists per scout wallet', () => {
    store.add('GSCOUT_A', 'player-1');
    store.add('GSCOUT_B', 'player-2');

    expect(store.list('GSCOUT_A').map((e) => e.playerId)).toEqual(['player-1']);
    expect(store.list('GSCOUT_B').map((e) => e.playerId)).toEqual(['player-2']);
  });

  it('removes an entry owned by the requesting scout', () => {
    const entry = store.add('GSCOUT', 'player-1');
    const removed = store.remove('GSCOUT', entry.id);

    expect(removed).toBe(true);
    expect(store.list('GSCOUT')).toEqual([]);
  });

  it('does not remove an entry owned by a different scout', () => {
    const entry = store.add('GSCOUT_A', 'player-1');
    const removed = store.remove('GSCOUT_B', entry.id);

    expect(removed).toBe(false);
    expect(store.list('GSCOUT_A')).toHaveLength(1);
  });

  it('returns false when removing a non-existent id', () => {
    expect(store.remove('GSCOUT', 999)).toBe(false);
  });
});
