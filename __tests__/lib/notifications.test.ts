/**
 * Unit tests for lib/notifications.ts
 *
 * Both exported functions are pure: no network calls, no IndexedDB.
 * Tests call them directly with representative fixtures.
 */
import {
  deriveNotifications,
  applyNotificationPreferences,
} from '@/lib/notifications';
import type { IndexedEvent } from '@/lib/indexerClient';
import type { Notification, NotificationPreferences } from '@/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WALLET = 'GPUBLIC_WALLET_ADDRESS';
const OTHER = 'GOTHER_WALLET_ADDRESS';

function makeMilestoneEvent(
  overrides: Partial<IndexedEvent> = {},
): IndexedEvent {
  return {
    id: 1,
    type: 'milestone_approved',
    playerId: WALLET,
    scout: null,
    validator: 'GVAL',
    ledger: 100,
    timestamp: 1_000_000,
    data: { description: 'Scored 5 goals', milestone_id: 'm1' },
    ...overrides,
  };
}

function makeContactEvent(overrides: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: 2,
    type: 'player_contacted',
    playerId: 'GPLAYER_ID',
    scout: WALLET,
    validator: null,
    ledger: 200,
    timestamp: 2_000_000,
    data: {},
    ...overrides,
  };
}

// ── deriveNotifications ───────────────────────────────────────────────────────

describe('deriveNotifications', () => {
  it('returns an empty array when there are no events', () => {
    expect(deriveNotifications([], WALLET)).toEqual([]);
  });

  it('maps a milestone_approved event for the wallet to a milestone_approval notification', () => {
    const events = [makeMilestoneEvent()];
    const notifications = deriveNotifications(events, WALLET);

    expect(notifications).toHaveLength(1);
    const n = notifications[0];
    expect(n.id).toBe(1);
    expect(n.category).toBe('milestone_approval');
    expect(n.title).toBe('Milestone approved');
    expect(n.message).toContain('Scored 5 goals');
    expect(n.read).toBe(false);
    expect(n.createdAt).toBe(1_000_000);
    expect(n.playerId).toBe(WALLET);
  });

  it('ignores milestone_approved events where the wallet is not the player', () => {
    const events = [makeMilestoneEvent({ playerId: OTHER })];
    expect(deriveNotifications(events, WALLET)).toHaveLength(0);
  });

  it('maps a player_contacted event for the wallet scout to a contact_unlock notification', () => {
    const events = [makeContactEvent()];
    const notifications = deriveNotifications(events, WALLET);

    expect(notifications).toHaveLength(1);
    const n = notifications[0];
    expect(n.id).toBe(2);
    expect(n.category).toBe('contact_unlock');
    expect(n.title).toBe('Contact details unlocked');
    expect(n.message).toContain('GPLAYER_ID');
    expect(n.read).toBe(false);
    expect(n.playerId).toBe('GPLAYER_ID');
  });

  it('ignores player_contacted events where the wallet is not the scout', () => {
    const events = [makeContactEvent({ scout: OTHER })];
    expect(deriveNotifications(events, WALLET)).toHaveLength(0);
  });

  it('falls back to "A milestone" when event data has no description', () => {
    const events = [makeMilestoneEvent({ data: {} })];
    const notifications = deriveNotifications(events, WALLET);

    expect(notifications[0].message).toContain('A milestone');
  });

  it('handles a player_contacted event where playerId is null', () => {
    const events = [makeContactEvent({ playerId: null })];
    const notifications = deriveNotifications(events, WALLET);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain('contact details');
  });

  it('ignores unrecognised event types', () => {
    const unknown = {
      ...makeMilestoneEvent(),
      type: 'fees_withdrawn',
    } as unknown as IndexedEvent;
    expect(deriveNotifications([unknown], WALLET)).toHaveLength(0);
  });

  it('returns notifications sorted newest-first by createdAt', () => {
    const events = [
      makeMilestoneEvent({ id: 1, timestamp: 1_000, playerId: WALLET }),
      makeContactEvent({ id: 2, timestamp: 3_000, scout: WALLET }),
      makeMilestoneEvent({ id: 3, timestamp: 2_000, playerId: WALLET }),
    ];
    const notifications = deriveNotifications(events, WALLET);

    expect(notifications.map((n) => n.createdAt)).toEqual([3_000, 2_000, 1_000]);
  });

  it('always sets read to false regardless of input', () => {
    const events = [makeMilestoneEvent(), makeContactEvent()];
    const notifications = deriveNotifications(events, WALLET);

    expect(notifications.every((n) => n.read === false)).toBe(true);
  });

  it('handles multiple events of both types in one pass', () => {
    const events = [
      makeMilestoneEvent({ id: 1, timestamp: 1_000, playerId: WALLET }),
      makeContactEvent({ id: 2, timestamp: 2_000, scout: WALLET }),
    ];
    const notifications = deriveNotifications(events, WALLET);

    expect(notifications).toHaveLength(2);
    const categories = notifications.map((n) => n.category);
    expect(categories).toContain('milestone_approval');
    expect(categories).toContain('contact_unlock');
  });
});

// ── applyNotificationPreferences ─────────────────────────────────────────────

describe('applyNotificationPreferences', () => {
  const milestoneNotification: Notification = {
    id: 1,
    category: 'milestone_approval',
    title: 'Milestone approved',
    message: 'X was approved.',
    createdAt: 1_000,
    read: false,
    playerId: WALLET,
  };

  const contactNotification: Notification = {
    id: 2,
    category: 'contact_unlock',
    title: 'Contact details unlocked',
    message: 'You unlocked contact details.',
    createdAt: 2_000,
    read: false,
    playerId: 'GPLAYER',
  };

  const ALL_ON: NotificationPreferences = {
    milestoneApprovals: true,
    contactUnlocks: true,
  };

  const ALL_OFF: NotificationPreferences = {
    milestoneApprovals: false,
    contactUnlocks: false,
  };

  it('returns all notifications when all preferences are enabled', () => {
    const result = applyNotificationPreferences(
      [milestoneNotification, contactNotification],
      ALL_ON,
    );
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when all preferences are disabled', () => {
    const result = applyNotificationPreferences(
      [milestoneNotification, contactNotification],
      ALL_OFF,
    );
    expect(result).toHaveLength(0);
  });

  it('filters out milestone_approval when milestoneApprovals is false', () => {
    const result = applyNotificationPreferences(
      [milestoneNotification, contactNotification],
      { milestoneApprovals: false, contactUnlocks: true },
    );
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('contact_unlock');
  });

  it('filters out contact_unlock when contactUnlocks is false', () => {
    const result = applyNotificationPreferences(
      [milestoneNotification, contactNotification],
      { milestoneApprovals: true, contactUnlocks: false },
    );
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('milestone_approval');
  });

  it('returns an empty array when the notifications list is empty', () => {
    const result = applyNotificationPreferences([], ALL_ON);
    expect(result).toHaveLength(0);
  });

  it('passes through notifications with an unrecognised category', () => {
    const unknown: Notification = {
      ...milestoneNotification,
      id: 99,
      category: 'contact_unlock', // use a valid category type, simulate unknown via cast
    };
    // Cast to unknown category to test the fallthrough branch
    const unknownCast = { ...unknown, category: 'unknown_type' as any };
    const result = applyNotificationPreferences([unknownCast], ALL_OFF);
    // The fallthrough `return true` keeps it regardless of preferences
    expect(result).toHaveLength(1);
  });

  it('does not mutate the input array', () => {
    const input = [milestoneNotification, contactNotification];
    const inputCopy = [...input];
    applyNotificationPreferences(input, ALL_OFF);
    expect(input).toEqual(inputCopy);
  });
});
