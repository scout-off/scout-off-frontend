/** @jest-environment node */
import { collectUserData, deleteUserData } from '@/lib/offChainDataCollection';
import { WatchlistStore } from '@/lib/watchlistStore';
import { SavedSearchStore } from '@/lib/savedSearchStore';
import { NotificationPreferencesStore } from '@/lib/notificationPreferencesStore';
import { NotificationReadStore } from '@/lib/notificationReadStore';
import { MilestoneDisputeStore } from '@/lib/milestoneDisputeStore';
import {
  initSession,
  clearSessionsForWallet,
  __resetForTests,
} from '@/lib/chunkedUploadStore';
import type { PlayerFilter } from '@/types';

const WALLET = 'GEXPORT0000000000000000000000000000000000000000000000000000000';
const OTHER = 'GOTHER000000000000000000000000000000000000000000000000000000000';

function resetAll(): void {
  WatchlistStore.resetInstance();
  SavedSearchStore.resetInstance();
  NotificationPreferencesStore.resetInstance();
  NotificationReadStore.resetInstance();
  MilestoneDisputeStore.resetInstance();
  __resetForTests();
}

beforeEach(resetAll);
afterEach(resetAll);

describe('collectUserData', () => {
  it('collects every in-scope store record referencing the wallet', async () => {
    WatchlistStore.getInstance().add(WALLET, 'player-1');
    WatchlistStore.getInstance().add(OTHER, 'player-other');
    SavedSearchStore.getInstance().add(WALLET, 'search-1', {} as PlayerFilter);
    NotificationPreferencesStore.getInstance().set(WALLET, {
      milestoneApprovals: false,
      contactUnlocks: true,
    });
    NotificationReadStore.getInstance().markRead(WALLET, [1, 2]);
    MilestoneDisputeStore.getInstance().create({
      playerId: 'player-1',
      playerWallet: WALLET,
      milestoneId: 'm-1',
      milestoneDescription: 'desc',
      reason: 'reason',
    });
    await initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 1024,
      totalChunks: 2,
      ownerWallet: WALLET,
    });
    await initSession({
      filename: 'other.mp4',
      fileType: 'video/mp4',
      fileSize: 1024,
      totalChunks: 2,
      ownerWallet: OTHER,
    });

    const data = await collectUserData(WALLET);

    expect(data.wallet).toBe(WALLET);
    // WatchlistStore.add normalizes the player id via normalizeStellarAddress
    // (upper-cases, canonicalizes valid keys), so it round-trips as PLAYER-1.
    expect(data.sections.watchlist.map((e) => e.playerId)).toEqual([
      'PLAYER-1',
    ]);
    expect(data.sections.savedSearches).toHaveLength(1);
    expect(data.sections.notificationPreferences).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
    expect(data.sections.notificationReadIds).toEqual([1, 2]);
    expect(data.sections.milestoneDisputes).toHaveLength(1);
    expect(data.sections.activeUploadSessions).toHaveLength(1);
    expect(data.sections.activeUploadSessions[0].filename).toBe('clip.mp4');

    expect(data.onChainExcluded.explorerUrl).toContain(WALLET);
    expect(data.onChainExcluded.explanation).toMatch(/on-chain/i);

    const excludedNames = data.excluded.map((e) => e.name);
    expect(excludedNames).toContain('contactDetailsCache');
    expect(excludedNames).toContain('messaging');
    expect(excludedNames).not.toContain('collectionErrors');
  });

  it('documents collection errors instead of dropping them silently', async () => {
    // Force the watchlist store to throw by closing its DB.
    WatchlistStore.getInstance().close();

    const data = await collectUserData(WALLET);
    expect(data.sections.watchlist).toEqual([]);
    expect(data.excluded.map((e) => e.name)).toContain('collectionErrors');
  });
});

describe('deleteUserData', () => {
  it('removes every in-scope record for the wallet but leaves others intact', async () => {
    WatchlistStore.getInstance().add(WALLET, 'player-1');
    WatchlistStore.getInstance().add(OTHER, 'player-other');
    SavedSearchStore.getInstance().add(WALLET, 'search-1', {} as PlayerFilter);
    NotificationPreferencesStore.getInstance().set(WALLET, {
      milestoneApprovals: true,
      contactUnlocks: true,
    });
    NotificationReadStore.getInstance().markRead(WALLET, [1, 2]);
    MilestoneDisputeStore.getInstance().create({
      playerId: 'player-1',
      playerWallet: WALLET,
      milestoneId: 'm-1',
      milestoneDescription: 'desc',
      reason: 'reason',
    });
    await initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 1024,
      totalChunks: 2,
      ownerWallet: WALLET,
    });

    const { removed } = await deleteUserData(WALLET);

    expect(removed.watchlist).toBe(1);
    expect(removed.savedSearches).toBe(1);
    expect(removed.notificationPreferences).toBe(1);
    expect(removed.notificationReadIds).toBe(2);
    expect(removed.milestoneDisputes).toBe(1);
    expect(removed.activeUploadSessions).toBe(1);
    expect(await clearSessionsForWallet(WALLET)).toBe(0);

    expect(WatchlistStore.getInstance().list(WALLET)).toEqual([]);
    expect(NotificationPreferencesStore.getInstance().get(WALLET)).toEqual({
      milestoneApprovals: true,
      contactUnlocks: true,
    });
    expect(NotificationReadStore.getInstance().getReadIds(WALLET)).toEqual([]);
    expect(MilestoneDisputeStore.getInstance().listForWallet(WALLET)).toEqual(
      [],
    );

    // Other wallet's data is untouched.
    expect(WatchlistStore.getInstance().list(OTHER)).toHaveLength(1);
  });
});
