/**
 * @jest-environment node
 */
import { NotificationReadStore } from '@/lib/notificationReadStore';

let store: NotificationReadStore;

beforeEach(() => {
  NotificationReadStore.resetInstance();
  store = NotificationReadStore.getInstance();
});

afterEach(() => {
  NotificationReadStore.resetInstance();
});

describe('NotificationReadStore', () => {
  it('is a singleton', () => {
    const a = NotificationReadStore.getInstance();
    const b = NotificationReadStore.getInstance();
    expect(a).toBe(b);
  });

  it('getReadIds returns an empty array for a wallet with no read state', () => {
    expect(store.getReadIds('GWALLET')).toEqual([]);
  });

  it('markRead persists ids retrievable via getReadIds', () => {
    store.markRead('GWALLET', [1, 2, 3]);

    expect(store.getReadIds('GWALLET').sort()).toEqual([1, 2, 3]);
  });

  it('markRead is a no-op for an empty id list', () => {
    store.markRead('GWALLET', []);
    expect(store.getReadIds('GWALLET')).toEqual([]);
  });

  it('markRead ignores duplicate ids already marked read (INSERT OR IGNORE)', () => {
    store.markRead('GWALLET', [1, 2]);
    store.markRead('GWALLET', [2, 3]);

    expect(store.getReadIds('GWALLET').sort()).toEqual([1, 2, 3]);
  });

  it('scopes read state per wallet', () => {
    store.markRead('GWALLET_A', [1, 2]);
    store.markRead('GWALLET_B', [3]);

    expect(store.getReadIds('GWALLET_A').sort()).toEqual([1, 2]);
    expect(store.getReadIds('GWALLET_B')).toEqual([3]);
  });
});
