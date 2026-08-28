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

describe('WatchlistStore address normalization', () => {
  beforeEach(() => {
    WatchlistStore.resetInstance();
    store = WatchlistStore.getInstance();
  });

  it('normalizes player addresses to uppercase before storage', () => {
    // Add with lowercase
    store.add('GSCOUT', 'gabc123def456ghi789jkl012mno345pqr678stu901vwx234yz567');
    // Add with mixed case
    store.add('GSCOUT', 'GABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234YZ567');

    const entries = store.list('GSCOUT');
    // Should only have 1 entry because addresses are normalized to same value
    expect(entries).toHaveLength(1);
    // Verify it's stored as uppercase
    expect(entries[0].playerId).toBe('GABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234YZ567');
  });

  it('normalizes scout wallet addresses to uppercase before storage', () => {
    // Add with mixed case scout wallet
    store.add('GscOuT', 'player-1');
    // Add with lowercase scout wallet (same player)
    store.add('GSCOUT', 'player-1');

    const entriesLower = store.list('GSCOUT');
    const entriesMixed = store.list('GscOuT');

    // Both should return the same entry because scout wallets are normalized
    expect(entriesLower).toHaveLength(1);
    expect(entriesMixed).toHaveLength(1);
    expect(entriesLower[0].scoutWallet).toBe('GSCOUT');
    expect(entriesMixed[0].scoutWallet).toBe('GSCOUT');
  });

  it('treats same address with different casing as duplicate', () => {
    const addrLower = 'gabc123def456ghi789jkl012mno345pqr678stu901vwx234yz567';
    const addrUpper = 'GABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234YZ567';

    store.add('GSCOUT', addrLower);
    store.add('GSCOUT', addrUpper);

    const entries = store.list('GSCOUT');
    // Should only have 1 entry despite adding same address twice with different casing
    expect(entries).toHaveLength(1);
  });
});
