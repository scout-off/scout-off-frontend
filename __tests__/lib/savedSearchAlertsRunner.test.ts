import { runSavedSearchAlerts } from '@/lib/savedSearchAlertsRunner';
import { SavedSearchAlertStore } from '@/lib/savedSearchAlertStore';
import { SavedSearchStore } from '@/lib/savedSearchStore';
import { NotificationPreferencesStore } from '@/lib/notificationPreferencesStore';
import { alertsToNotifications } from '@/lib/savedSearchAlertNotifications';
import type { IndexedEvent } from '@/lib/indexerClient';
import type { MatchablePlayer } from '@/lib/savedSearchMatch';
import type { SavedSearchAlertChannel } from '@/lib/savedSearchAlertDelivery';

const SCOUT = 'GSCOUT';
const OTHER_SCOUT = 'GOTHER';

function event(
  id: number,
  type: IndexedEvent['type'],
  playerId: string | null,
): IndexedEvent {
  return {
    id,
    type,
    playerId,
    scout: null,
    validator: null,
    ledger: id,
    timestamp: id,
    data: {},
  };
}

const PLAYERS: Record<string, MatchablePlayer> = {
  striker: {
    vitals: { region: 'nigeria', position: 'ST' },
    progressLevel: 1,
  },
  keeper: { vitals: { region: 'kenya', position: 'GK' }, progressLevel: 0 },
};

function resetStores() {
  SavedSearchAlertStore.resetInstance();
  SavedSearchStore.resetInstance();
  NotificationPreferencesStore.resetInstance();
}

function deps(events: IndexedEvent[], overrides = {}) {
  return {
    fetchEvents: jest.fn(async ({ after = 0 }: { after?: number }) => ({
      events: events.filter((e) => e.id > after),
      nextCursor: null,
    })),
    getPlayer: jest.fn(async (id: string) => PLAYERS[id] ?? null),
    hasActiveSubscription: jest.fn(async () => true),
    now: () => 1_000_000,
    ...overrides,
  };
}

describe('runSavedSearchAlerts', () => {
  beforeEach(() => {
    resetStores();
    SavedSearchStore.getInstance().add(SCOUT, 'Strikers', { position: 'ST' });
  });
  afterEach(resetStores);

  it('records one alert per (scout, search, player) and dedupes repeats', async () => {
    const events = [
      event(1, 'player_registered', 'striker'),
      event(2, 'milestone_approved', 'striker'),
      event(3, 'player_registered', 'keeper'),
    ];
    const first = await runSavedSearchAlerts(deps(events));
    expect(first.alertsRecorded).toBe(1);
    expect(first.alertsDelivered).toBe(1);

    // A second run re-reading the same events (cursor reset) adds nothing.
    SavedSearchAlertStore.getInstance().setCursor(0);
    const second = await runSavedSearchAlerts(deps(events));
    expect(second.alertsRecorded).toBe(0);
    expect(
      SavedSearchAlertStore.getInstance().listForWallet(SCOUT),
    ).toHaveLength(1);
  });

  it('ignores events that are not registrations or level changes', async () => {
    const result = await runSavedSearchAlerts(
      deps([event(1, 'player_contacted', 'striker')]),
    );
    expect(result.alertsRecorded).toBe(0);
    expect(result.eventsProcessed).toBe(1);
  });

  it('persists the cursor and resumes after it', async () => {
    const d = deps([event(5, 'player_registered', 'striker')]);
    await runSavedSearchAlerts(d);
    expect(SavedSearchAlertStore.getInstance().getCursor()).toBe(5);

    const next = deps([event(5, 'player_registered', 'striker')]);
    const result = await runSavedSearchAlerts(next);
    expect(next.fetchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ after: 5 }),
    );
    expect(result.eventsProcessed).toBe(0);
  });

  it('skips scouts without an active subscription', async () => {
    const result = await runSavedSearchAlerts(
      deps([event(1, 'player_registered', 'striker')], {
        hasActiveSubscription: jest.fn(async () => false),
      }),
    );
    expect(result.alertsRecorded).toBe(0);
  });

  it('skips scouts who turned the category off', async () => {
    NotificationPreferencesStore.getInstance().setSavedSearchAlerts(SCOUT, {
      enabled: false,
      delivery: 'instant',
    });
    const result = await runSavedSearchAlerts(
      deps([event(1, 'player_registered', 'striker')]),
    );
    expect(result.alertsRecorded).toBe(0);
  });

  it('delivers daily-digest scouts at most once a day', async () => {
    SavedSearchStore.getInstance().add(OTHER_SCOUT, 'All', {});
    NotificationPreferencesStore.getInstance().setSavedSearchAlerts(
      OTHER_SCOUT,
      { enabled: true, delivery: 'daily' },
    );
    const channel: SavedSearchAlertChannel = {
      name: 'spy',
      deliver: jest.fn(async (_w, alerts, { digest }) =>
        SavedSearchAlertStore.getInstance().markDelivered(
          alerts.map((a) => a.id),
          digest,
          1_000_000,
        ),
      ),
    };

    await runSavedSearchAlerts(
      deps([event(1, 'player_registered', 'striker')], {
        channels: [channel],
      }),
    );
    expect(channel.deliver).toHaveBeenCalledWith(
      OTHER_SCOUT,
      expect.any(Array),
      { digest: true },
    );

    // Another match an hour later stays pending for the digest scout.
    await runSavedSearchAlerts(
      deps([event(2, 'player_registered', 'keeper')], {
        channels: [channel],
        now: () => 1_000_000 + 3600,
      }),
    );
    const pending = SavedSearchAlertStore.getInstance()
      .listPending()
      .filter((a) => a.scoutWallet === OTHER_SCOUT);
    expect(pending).toHaveLength(1);
  });
});

describe('alertsToNotifications', () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it('maps instant alerts individually and daily alerts to one digest', () => {
    const store = SavedSearchAlertStore.getInstance();
    const base = { scoutWallet: SCOUT, eventId: 1, filter: { position: 'ST' } };
    const a = store.record({
      ...base,
      searchId: 1,
      searchName: 'Strikers',
      playerId: 'p1',
    })!;
    const b = store.record({
      ...base,
      searchId: 1,
      searchName: 'Strikers',
      playerId: 'p2',
    })!;
    const c = store.record({
      ...base,
      searchId: 1,
      searchName: 'Strikers',
      playerId: 'p3',
    })!;
    store.markDelivered([a.id], false, 100);
    store.markDelivered([b.id, c.id], true, 200);

    const notifications = alertsToNotifications(store.listDelivered(SCOUT));
    expect(notifications).toHaveLength(2);
    expect(notifications[0]).toMatchObject({
      id: -b.id,
      category: 'saved_search_match',
      href: '/scout?position=ST',
    });
    expect(notifications[0].message).toContain('2 new players');
    expect(notifications[1]).toMatchObject({ id: -a.id, playerId: 'p1' });
  });
});
