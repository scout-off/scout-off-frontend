/**
 * @jest-environment node
 */
import { executeWalletMigration } from '@/lib/walletMigration';
import { WatchlistStore } from '@/lib/watchlistStore';
import { SavedSearchStore } from '@/lib/savedSearchStore';
import { NotificationPreferencesStore } from '@/lib/notificationPreferencesStore';
import { NotificationReadStore } from '@/lib/notificationReadStore';
import { RecentlyViewedStore } from '@/lib/recentlyViewedStore';
import { SessionStore } from '@/lib/sessionStore';
import type { PlayerFilter } from '@/types';

const FROM = 'GFROMWALLET';
const TO = 'GTOWALLET';
const FILTER = {} as PlayerFilter;
const FUTURE = Date.now() + 60 * 60 * 1000;

function resetAll(): void {
  WatchlistStore.resetInstance();
  SavedSearchStore.resetInstance();
  NotificationPreferencesStore.resetInstance();
  NotificationReadStore.resetInstance();
  RecentlyViewedStore.resetInstance();
  SessionStore.resetInstance();
}

beforeEach(() => {
  resetAll();
});

afterEach(() => {
  jest.restoreAllMocks();
  resetAll();
});

function seedFrom(): void {
  const watchlist = WatchlistStore.getInstance();
  watchlist.add(FROM, 'PLAYER-1');
  watchlist.add(FROM, 'PLAYER-2');
  const searches = SavedSearchStore.getInstance();
  searches.add(FROM, 'Strikers', FILTER);
  NotificationPreferencesStore.getInstance().set(FROM, {
    milestoneApprovals: false,
    contactUnlocks: false,
  });
  NotificationReadStore.getInstance().markRead(FROM, [1, 2, 3]);
  const recent = RecentlyViewedStore.getInstance();
  recent.record(FROM, 'PLAYER-1', 1000);
  recent.record(FROM, 'PLAYER-3', 2000);
  const sessions = SessionStore.getInstance();
  sessions.create('sess-from-1', FROM, FUTURE);
  sessions.create('sess-from-2', FROM, FUTURE);
}

describe('executeWalletMigration', () => {
  it('moves all off-chain data from one wallet to the other (happy path)', async () => {
    seedFrom();

    const result = await executeWalletMigration(FROM, TO);

    expect(result.counts).toEqual({
      watchlist: 2,
      savedSearches: 1,
      notificationPrefsTransferred: true,
      notificationReadIds: 3,
      recentlyViewed: 2,
      sessionsRevoked: 2,
    });

    expect(WatchlistStore.getInstance().list(TO)).toHaveLength(2);
    expect(WatchlistStore.getInstance().list(FROM)).toHaveLength(0);
    expect(SavedSearchStore.getInstance().list(TO).map((s) => s.name)).toEqual([
      'Strikers',
    ]);
    expect(SavedSearchStore.getInstance().list(FROM)).toHaveLength(0);
    expect(NotificationPreferencesStore.getInstance().get(TO)).toEqual({
      milestoneApprovals: false,
      contactUnlocks: false,
    });
    expect(NotificationReadStore.getInstance().getReadIds(TO).sort()).toEqual([
      1, 2, 3,
    ]);
    expect(NotificationReadStore.getInstance().getReadIds(FROM)).toEqual([]);
    const recentTo = RecentlyViewedStore.getInstance().list(TO);
    expect(recentTo.map((r) => r.playerId).sort()).toEqual([
      'PLAYER-1',
      'PLAYER-3',
    ]);
    expect(RecentlyViewedStore.getInstance().list(FROM)).toHaveLength(0);
  });

  it('merges overlapping watchlist entries without duplicates or crashes', async () => {
    const watchlist = WatchlistStore.getInstance();
    watchlist.add(FROM, 'PLAYER-1');
    watchlist.add(FROM, 'PLAYER-2');
    watchlist.add(TO, 'PLAYER-1');

    const result = await executeWalletMigration(FROM, TO);

    // counts reflects what was snapshotted from `from`, not net-new rows.
    expect(result.counts.watchlist).toBe(2);
    const ids = watchlist.list(TO).map((e) => e.playerId).sort();
    expect(ids).toEqual(['PLAYER-1', 'PLAYER-2']);
    expect(watchlist.list(FROM)).toHaveLength(0);
  });

  it('keeps existing saved searches on the destination wallet', async () => {
    const searches = SavedSearchStore.getInstance();
    searches.add(FROM, 'Strikers', FILTER);
    searches.add(FROM, 'Keepers', FILTER);
    searches.add(TO, 'Strikers', FILTER);

    await expect(executeWalletMigration(FROM, TO)).resolves.toBeDefined();

    const names = searches.list(TO).map((s) => s.name);
    // Documents current behaviour: the destination keeps its own rows and
    // receives the migrated ones; the source is emptied.
    expect(names).toEqual(expect.arrayContaining(['Strikers', 'Keepers']));
    expect(searches.list(FROM)).toHaveLength(0);
  });

  it('revokes sessions for the source wallet and leaves the destination untouched', async () => {
    const sessions = SessionStore.getInstance();
    sessions.create('sess-from', FROM, FUTURE);
    sessions.create('sess-to', TO, FUTURE);

    const result = await executeWalletMigration(FROM, TO);

    expect(result.counts.sessionsRevoked).toBe(1);
    expect(sessions.isActive('sess-from')).toBe(false);
    expect(sessions.isActive('sess-to')).toBe(true);
  });

  it('reports zero revoked sessions when the source has none', async () => {
    const result = await executeWalletMigration(FROM, TO);
    expect(result.counts.sessionsRevoked).toBe(0);
  });

  it('transfers notification preferences and overwrites the destination preferences', async () => {
    const prefs = NotificationPreferencesStore.getInstance();
    prefs.set(FROM, { milestoneApprovals: false, contactUnlocks: true });
    prefs.set(TO, { milestoneApprovals: true, contactUnlocks: false });

    const result = await executeWalletMigration(FROM, TO);

    expect(result.counts.notificationPrefsTransferred).toBe(true);
    expect(prefs.get(TO)).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
  });

  it('writes default preferences to the destination when the source had none', async () => {
    const prefs = NotificationPreferencesStore.getInstance();
    const defaults = prefs.get('GNOBODY');
    prefs.set(TO, { milestoneApprovals: !defaults.milestoneApprovals, contactUnlocks: !defaults.contactUnlocks });

    const result = await executeWalletMigration(FROM, TO);

    // Documents current behaviour: the flag is always true and the source's
    // defaults replace whatever the destination had.
    expect(result.counts.notificationPrefsTransferred).toBe(true);
    expect(prefs.get(TO)).toEqual(defaults);
  });

  it('rejects when a store throws and leaves a partially migrated state', async () => {
    seedFrom();
    jest
      .spyOn(SessionStore.getInstance(), 'revokeAllForWallet')
      .mockImplementation(() => {
        throw new Error('session store down');
      });

    await expect(executeWalletMigration(FROM, TO)).rejects.toThrow(
      'session store down',
    );

    // Baseline for the atomicity issue: earlier steps already committed.
    expect(WatchlistStore.getInstance().list(FROM)).toHaveLength(0);
    expect(WatchlistStore.getInstance().list(TO)).toHaveLength(2);
    expect(SessionStore.getInstance().isActive('sess-from-1')).toBe(true);
  });

  it('propagates an error from an earlier store', async () => {
    jest
      .spyOn(WatchlistStore.getInstance(), 'clearForWallet')
      .mockImplementation(() => {
        throw new Error('watchlist failure');
      });

    await expect(executeWalletMigration(FROM, TO)).rejects.toThrow(
      'watchlist failure',
    );
  });

  it('with the same wallet, keeps list data, resets preferences and revokes sessions', async () => {
    seedFrom();

    const result = await executeWalletMigration(FROM, FROM);

    // Documents current behaviour: no guard against from === to.
    expect(WatchlistStore.getInstance().list(FROM)).toHaveLength(2);
    expect(NotificationReadStore.getInstance().getReadIds(FROM)).toHaveLength(3);
    expect(NotificationPreferencesStore.getInstance().get(FROM)).toEqual(
      NotificationPreferencesStore.getInstance().get('GNOBODY'),
    );
    expect(result.counts.sessionsRevoked).toBe(2);
  });

  it('sets result metadata and the on-chain transfer notice', async () => {
    const before = Date.now();
    const result = await executeWalletMigration(FROM, TO);

    expect(result.fromWallet).toBe(FROM);
    expect(result.toWallet).toBe(TO);
    expect(result.migratedAt).toBeGreaterThanOrEqual(before);
    expect(result.migratedAt).toBeLessThanOrEqual(Date.now());
    expect(result.onChainTransferBlocked.trackingIssue).toMatch(/\/issues\/1315$/);
    expect(result.onChainTransferBlocked.reason).toContain('transfer_player');
  });
});
