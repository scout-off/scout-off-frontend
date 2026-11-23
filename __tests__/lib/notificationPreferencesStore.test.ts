/**
 * @jest-environment node
 */
import {
  NotificationPreferencesStore,
  PreferencesConflictError,
} from '@/lib/notificationPreferencesStore';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/notificationPreferencesClient';

let store: NotificationPreferencesStore;

beforeEach(() => {
  NotificationPreferencesStore.resetInstance();
  store = NotificationPreferencesStore.getInstance();
});

afterEach(() => {
  NotificationPreferencesStore.resetInstance();
});

describe('NotificationPreferencesStore', () => {
  it('is a singleton', () => {
    const a = NotificationPreferencesStore.getInstance();
    const b = NotificationPreferencesStore.getInstance();
    expect(a).toBe(b);
  });

  it('get returns the default preferences when no row exists for the wallet', () => {
    expect(store.get('GWALLET')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('set persists preferences and get returns them back', () => {
    const result = store.set('GWALLET', {
      milestoneApprovals: false,
      contactUnlocks: true,
    });

    expect(result).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
    expect(store.get('GWALLET')).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
  });

  it('set both categories off is persisted correctly', () => {
    store.set('GWALLET', { milestoneApprovals: false, contactUnlocks: false });

    expect(store.get('GWALLET')).toEqual({
      milestoneApprovals: false,
      contactUnlocks: false,
    });
  });

  it('set upserts on repeated calls for the same wallet (no duplicate rows)', () => {
    store.set('GWALLET', { milestoneApprovals: false, contactUnlocks: false });
    store.set('GWALLET', { milestoneApprovals: true, contactUnlocks: false });

    expect(store.get('GWALLET')).toEqual({
      milestoneApprovals: true,
      contactUnlocks: false,
    });
  });

  it('scopes preferences per wallet', () => {
    store.set('GWALLET_A', {
      milestoneApprovals: false,
      contactUnlocks: true,
    });
    store.set('GWALLET_B', {
      milestoneApprovals: true,
      contactUnlocks: false,
    });

    expect(store.get('GWALLET_A')).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
    expect(store.get('GWALLET_B')).toEqual({
      milestoneApprovals: true,
      contactUnlocks: false,
    });
  });
});

describe('NotificationPreferencesStore — optimistic concurrency (issue #1178)', () => {
  it('getWithVersion returns version 0 and the defaults when no row exists', () => {
    const { preferences, updatedAt } = store.getWithVersion('GNOROW');
    expect(preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(updatedAt).toBe(0);
  });

  it('getWithVersion returns a positive, increasing version after writes', () => {
    const first = store.setWithVersionCheck('GVER', {
      milestoneApprovals: true,
      contactUnlocks: true,
    });
    expect(first.updatedAt).toBeGreaterThan(0);

    const { updatedAt: versionAfterGet } = store.getWithVersion('GVER');
    expect(versionAfterGet).toBe(first.updatedAt);
  });

  it('setWithVersionCheck applies the write when baseVersion matches the current version', () => {
    const { updatedAt } = store.setWithVersionCheck('GMATCH', {
      milestoneApprovals: true,
      contactUnlocks: true,
    });

    const result = store.setWithVersionCheck(
      'GMATCH',
      { milestoneApprovals: false, contactUnlocks: true },
      updatedAt,
    );

    expect(result.preferences).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
    expect(store.get('GMATCH')).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
  });

  it('setWithVersionCheck accepts baseVersion 0 for a wallet with no existing row', () => {
    const result = store.setWithVersionCheck(
      'GFIRSTWRITE',
      { milestoneApprovals: false, contactUnlocks: false },
      0,
    );
    expect(result.preferences).toEqual({
      milestoneApprovals: false,
      contactUnlocks: false,
    });
  });

  it('setWithVersionCheck rejects with PreferencesConflictError when baseVersion is stale', () => {
    const { updatedAt: originalVersion } = store.setWithVersionCheck('GSTALE', {
      milestoneApprovals: true,
      contactUnlocks: true,
    });
    // A second write (e.g. from another tab) advances the version.
    store.setWithVersionCheck(
      'GSTALE',
      { milestoneApprovals: false, contactUnlocks: true },
      originalVersion,
    );

    // A third write still carrying the *original* (now stale) version must
    // be rejected rather than silently applied on top of the second write.
    expect(() =>
      store.setWithVersionCheck(
        'GSTALE',
        { milestoneApprovals: true, contactUnlocks: false },
        originalVersion,
      ),
    ).toThrow(PreferencesConflictError);

    // The rejected write did not change the stored value.
    expect(store.get('GSTALE')).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
  });

  it('PreferencesConflictError carries the current value and version for the caller to surface', () => {
    const { updatedAt: originalVersion } = store.setWithVersionCheck(
      'GCONFLICTSHAPE',
      { milestoneApprovals: true, contactUnlocks: true },
    );
    store.setWithVersionCheck(
      'GCONFLICTSHAPE',
      { milestoneApprovals: false, contactUnlocks: false },
      originalVersion,
    );

    try {
      store.setWithVersionCheck(
        'GCONFLICTSHAPE',
        { milestoneApprovals: true, contactUnlocks: true },
        originalVersion,
      );
      throw new Error('expected setWithVersionCheck to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PreferencesConflictError);
      const conflict = err as PreferencesConflictError;
      expect(conflict.current).toEqual({
        milestoneApprovals: false,
        contactUnlocks: false,
      });
      expect(conflict.currentVersion).toBeGreaterThan(originalVersion);
    }
  });

  it('set() (no version check) always applies, matching pre-#1178 behaviour', () => {
    store.setWithVersionCheck('GLEGACY', {
      milestoneApprovals: true,
      contactUnlocks: true,
    });

    // set() has no baseVersion parameter at all — it must never throw a
    // conflict, regardless of how many prior writes there were.
    const result = store.set('GLEGACY', {
      milestoneApprovals: false,
      contactUnlocks: false,
    });
    expect(result).toEqual({
      milestoneApprovals: false,
      contactUnlocks: false,
    });
  });
});
