/** @jest-environment node */
import { MilestoneEndorsementStore } from '@/lib/milestoneEndorsementStore';

beforeEach(() => {
  MilestoneEndorsementStore.resetInstance();
});

afterEach(() => {
  MilestoneEndorsementStore.resetInstance();
});

describe('MilestoneEndorsementStore', () => {
  it('returns an empty list for a milestone with no endorsements', () => {
    const store = MilestoneEndorsementStore.getInstance();
    expect(store.listFor('player-1', 'milestone-1')).toEqual([]);
  });

  it('records an endorsement and lists it back', () => {
    const store = MilestoneEndorsementStore.getInstance();
    store.add('player-1', 'milestone-1', 'GWALLET_A');

    const list = store.listFor('player-1', 'milestone-1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      playerId: 'player-1',
      milestoneId: 'milestone-1',
      wallet: 'GWALLET_A',
    });
  });

  it('is idempotent — endorsing the same milestone twice from the same wallet does not duplicate', () => {
    const store = MilestoneEndorsementStore.getInstance();
    store.add('player-1', 'milestone-1', 'GWALLET_A');
    store.add('player-1', 'milestone-1', 'GWALLET_A');

    expect(store.listFor('player-1', 'milestone-1')).toHaveLength(1);
  });

  it('tracks endorsements from multiple distinct wallets separately', () => {
    const store = MilestoneEndorsementStore.getInstance();
    store.add('player-1', 'milestone-1', 'GWALLET_A');
    store.add('player-1', 'milestone-1', 'GWALLET_B');
    store.add('player-1', 'milestone-1', 'GWALLET_C');

    const wallets = store
      .listFor('player-1', 'milestone-1')
      .map((e) => e.wallet);
    expect(wallets).toEqual(['GWALLET_A', 'GWALLET_B', 'GWALLET_C']);
  });

  it('keeps endorsements scoped to their own (player, milestone) pair', () => {
    const store = MilestoneEndorsementStore.getInstance();
    store.add('player-1', 'milestone-1', 'GWALLET_A');
    store.add('player-1', 'milestone-2', 'GWALLET_A');
    store.add('player-2', 'milestone-1', 'GWALLET_A');

    expect(store.listFor('player-1', 'milestone-1')).toHaveLength(1);
    expect(store.listFor('player-1', 'milestone-2')).toHaveLength(1);
    expect(store.listFor('player-2', 'milestone-1')).toHaveLength(1);
  });
});
