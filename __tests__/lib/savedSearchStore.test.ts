/**
 * @jest-environment node
 */
import { SavedSearchStore } from '@/lib/savedSearchStore';
import type { PlayerFilter } from '@/types';

let store: SavedSearchStore;

const FILTER: PlayerFilter = {
  region: 'Europe',
  position: 'Forward',
  minLevel: 1,
};

beforeEach(() => {
  SavedSearchStore.resetInstance();
  store = SavedSearchStore.getInstance();
});

afterEach(() => {
  SavedSearchStore.resetInstance();
});

describe('SavedSearchStore', () => {
  it('is a singleton', () => {
    const a = SavedSearchStore.getInstance();
    const b = SavedSearchStore.getInstance();
    expect(a).toBe(b);
  });

  it('adds and lists searches for a scout, newest first', () => {
    store.add('GSCOUT', 'First', FILTER);
    store.add('GSCOUT', 'Second', { region: 'Africa' });

    const searches = store.list('GSCOUT');
    expect(searches.map((s) => s.name)).toEqual(['Second', 'First']);
  });

  it('round-trips the filter as JSON', () => {
    store.add('GSCOUT', 'My search', FILTER);
    const [entry] = store.list('GSCOUT');
    expect(entry.filter).toEqual(FILTER);
  });

  it('scopes lists per scout wallet', () => {
    store.add('GSCOUT_A', 'A search', FILTER);
    store.add('GSCOUT_B', 'B search', FILTER);

    expect(store.list('GSCOUT_A').map((s) => s.name)).toEqual(['A search']);
    expect(store.list('GSCOUT_B').map((s) => s.name)).toEqual(['B search']);
  });

  it('removes a search owned by the requesting scout', () => {
    const entry = store.add('GSCOUT', 'My search', FILTER);
    const removed = store.remove('GSCOUT', entry.id);

    expect(removed).toBe(true);
    expect(store.list('GSCOUT')).toEqual([]);
  });

  it('does not remove a search owned by a different scout', () => {
    const entry = store.add('GSCOUT_A', 'My search', FILTER);
    const removed = store.remove('GSCOUT_B', entry.id);

    expect(removed).toBe(false);
    expect(store.list('GSCOUT_A')).toHaveLength(1);
  });

  it('returns false when removing a non-existent id', () => {
    expect(store.remove('GSCOUT', 999)).toBe(false);
  });

  it('initializes lastViewedAt to createdAt on add', () => {
    const entry = store.add('GSCOUT', 'My search', FILTER);
    expect(entry.lastViewedAt).toBe(entry.createdAt);
  });

  it('markViewed updates lastViewedAt for the owning scout', () => {
    const entry = store.add('GSCOUT', 'My search', FILTER);
    const updated = store.markViewed('GSCOUT', entry.id);

    expect(updated).not.toBeNull();
    expect(updated!.lastViewedAt).toBeGreaterThanOrEqual(entry.createdAt);
    expect(store.list('GSCOUT')[0].lastViewedAt).toBe(updated!.lastViewedAt);
  });

  it('markViewed does not update a search owned by a different scout', () => {
    const entry = store.add('GSCOUT_A', 'My search', FILTER);
    const updated = store.markViewed('GSCOUT_B', entry.id);

    expect(updated).toBeNull();
    expect(store.list('GSCOUT_A')[0].lastViewedAt).toBe(entry.createdAt);
  });

  it('markViewed returns null for a non-existent id', () => {
    expect(store.markViewed('GSCOUT', 999)).toBeNull();
  });
});
