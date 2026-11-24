/**
 * @jest-environment node
 */
import { FraudThrottleStore } from '@/lib/fraudThrottleStore';

let store: FraudThrottleStore;

beforeEach(() => {
  FraudThrottleStore.resetInstance();
  store = FraudThrottleStore.getInstance();
});

afterEach(() => {
  FraudThrottleStore.resetInstance();
});

describe('FraudThrottleStore', () => {
  it('places a wallet in a throttled state', () => {
    const throttle = store.placeThrottle({
      wallet: 'GREDEEMER',
      heuristic: 'cross_scout_redeemer_ring',
      category: 'referral',
      flagId: 'referral:cross_scout_redeemer_ring:GREDEEMER',
      reason: 'Wallet redeemed referral codes from 8 distinct scouts.',
      evidence: { distinctScouts: 8 },
    });

    expect(throttle.status).toBe('throttled');
    expect(throttle.liftedAt).toBeNull();
    expect(store.getActiveThrottle('GREDEEMER')?.id).toBe(throttle.id);
  });

  it('is idempotent per (wallet, heuristic) — does not duplicate an active throttle', () => {
    const first = store.placeThrottle({
      wallet: 'GREDEEMER',
      heuristic: 'cross_scout_redeemer_ring',
      category: 'referral',
      flagId: 'flag-1',
      reason: 'reason 1',
      evidence: {},
    });
    const second = store.placeThrottle({
      wallet: 'GREDEEMER',
      heuristic: 'cross_scout_redeemer_ring',
      category: 'referral',
      flagId: 'flag-1',
      reason: 'reason 1',
      evidence: {},
    });

    expect(second.id).toBe(first.id);
    expect(store.listAll()).toHaveLength(1);
  });

  it('never auto-expires — only liftThrottle changes an active throttle', () => {
    const throttle = store.placeThrottle({
      wallet: 'GREDEEMER',
      heuristic: 'self_redemption',
      category: 'referral',
      flagId: 'flag-2',
      reason: 'self redemption',
      evidence: {},
    });

    // No expiry mechanism exists — status stays 'throttled' indefinitely
    // until an explicit lift.
    expect(store.getActiveThrottle('GREDEEMER')?.status).toBe('throttled');

    const lifted = store.liftThrottle(throttle.id, 'GADMIN', 'false positive');
    expect(lifted?.status).toBe('lifted');
    expect(lifted?.liftedBy).toBe('GADMIN');
    expect(lifted?.liftReason).toBe('false positive');
    expect(store.getActiveThrottle('GREDEEMER')).toBeNull();
  });

  it('returns null when lifting an id that does not exist or is already lifted', () => {
    expect(store.liftThrottle(9999, 'GADMIN')).toBeNull();

    const throttle = store.placeThrottle({
      wallet: 'GREDEEMER',
      heuristic: 'self_redemption',
      category: 'referral',
      flagId: 'flag-3',
      reason: 'reason',
      evidence: {},
    });
    store.liftThrottle(throttle.id, 'GADMIN');
    expect(store.liftThrottle(throttle.id, 'GADMIN')).toBeNull();
  });

  it('listAll retains both throttled and lifted rows as the admin-auditable trail', () => {
    const a = store.placeThrottle({
      wallet: 'GA',
      heuristic: 'self_redemption',
      category: 'referral',
      flagId: 'flag-a',
      reason: 'reason a',
      evidence: {},
    });
    store.placeThrottle({
      wallet: 'GB',
      heuristic: 'cross_scout_redeemer_ring',
      category: 'referral',
      flagId: 'flag-b',
      reason: 'reason b',
      evidence: {},
    });
    store.liftThrottle(a.id, 'GADMIN', 'reviewed, false positive');

    const all = store.listAll();
    expect(all).toHaveLength(2);
    expect(store.listActive()).toHaveLength(1);
    expect(all.find((t) => t.id === a.id)?.status).toBe('lifted');
  });
});
