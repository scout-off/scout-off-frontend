/**
 * @jest-environment node
 */
import { FraudFlagDismissalStore } from '@/lib/fraudFlagDismissalStore';
import { computeFraudFlagDismissalKey } from '@/lib/fraudDetection';
import type { FraudFlag } from '@/types';

let store: FraudFlagDismissalStore;

beforeEach(() => {
  FraudFlagDismissalStore.resetInstance();
  store = FraudFlagDismissalStore.getInstance();
});

afterEach(() => {
  FraudFlagDismissalStore.resetInstance();
});

function makeFlag(overrides: Partial<FraudFlag> = {}): FraudFlag {
  return {
    id: 'pay_to_contact:subscription_cycling:GSCOUT',
    category: 'pay_to_contact',
    heuristic: 'subscription_cycling',
    severity: 'medium',
    wallets: ['GSCOUT'],
    reason: '3 subscriptions averaging 1.0 contacts each.',
    evidence: {
      subscriptions: 3,
      totalContacts: 3,
      avgContactsPerSubscription: 1,
      avgGapDays: 180,
    },
    ...overrides,
  };
}

/**
 * Simulates "the panel filters a fresh evaluation": recompute the key for
 * every currently-computed flag and drop the ones already dismissed. This
 * is exactly what GET /api/admin/fraud-flags does with
 * FraudFlagDismissalStore.getDismissedKeys().
 */
function visibleFlags(flags: FraudFlag[], store: FraudFlagDismissalStore) {
  const dismissed = store.getDismissedKeys();
  return flags.filter((f) => !dismissed.has(computeFraudFlagDismissalKey(f)));
}

describe('FraudFlagDismissalStore', () => {
  it('persists a dismissal with who/when/why', () => {
    const flag = makeFlag();
    const key = computeFraudFlagDismissalKey(flag);

    const dismissal = store.dismiss({
      flagKey: key,
      category: flag.category,
      heuristic: flag.heuristic,
      severity: flag.severity,
      wallets: flag.wallets,
      flagReason: flag.reason,
      note: 'Reviewed: scout with 3 subscriptions 6 months apart, not abuse.',
      dismissedBy: 'GADMIN',
    });

    expect(dismissal.flagKey).toBe(key);
    expect(dismissal.dismissedBy).toBe('GADMIN');
    expect(dismissal.note).toContain('6 months apart');
    expect(typeof dismissal.dismissedAt).toBe('number');
    expect(store.isDismissed(key)).toBe(true);
  });

  it('dismiss → re-run with identical underlying data → does not reappear', () => {
    const flag = makeFlag();
    const key = computeFraudFlagDismissalKey(flag);
    store.dismiss({
      flagKey: key,
      category: flag.category,
      heuristic: flag.heuristic,
      severity: flag.severity,
      wallets: flag.wallets,
      flagReason: flag.reason,
      dismissedBy: 'GADMIN',
    });

    // A fresh heuristic run over unchanged data reproduces the exact same
    // flag (same category/heuristic/severity/wallets) — content-equal, but
    // a distinct object instance, since heuristics recompute from scratch.
    const rerun = makeFlag();
    expect(visibleFlags([rerun], store)).toEqual([]);
  });

  it('dismiss → re-run with worsened data (higher severity) → reappears', () => {
    const flag = makeFlag({ severity: 'medium' });
    const key = computeFraudFlagDismissalKey(flag);
    store.dismiss({
      flagKey: key,
      category: flag.category,
      heuristic: flag.heuristic,
      severity: flag.severity,
      wallets: flag.wallets,
      flagReason: flag.reason,
      dismissedBy: 'GADMIN',
    });

    // Same wallet, same heuristic, but the pattern has worsened enough to
    // cross into 'high' severity (e.g. more subscriptions, lower yield).
    const worsened = makeFlag({
      severity: 'high',
      reason: '6 subscriptions averaging 0.5 contacts each.',
      evidence: {
        subscriptions: 6,
        totalContacts: 3,
        avgContactsPerSubscription: 0.5,
        avgGapDays: 20,
      },
    });

    expect(visibleFlags([worsened], store)).toEqual([worsened]);
  });

  it('dismiss → a different heuristic on the same wallet → reappears', () => {
    const flag = makeFlag();
    const key = computeFraudFlagDismissalKey(flag);
    store.dismiss({
      flagKey: key,
      category: flag.category,
      heuristic: flag.heuristic,
      severity: flag.severity,
      wallets: flag.wallets,
      flagReason: flag.reason,
      dismissedBy: 'GADMIN',
    });

    const otherHeuristic = makeFlag({
      category: 'referral',
      heuristic: 'concentrated_redeemer',
      wallets: ['GSCOUT', 'GREDEEMER'],
      reason: 'Different pattern entirely.',
    });

    expect(visibleFlags([otherHeuristic], store)).toEqual([otherHeuristic]);
  });

  it('getDismissedKeys reflects every dismissed key for batch filtering', () => {
    const a = makeFlag({ wallets: ['GA'] });
    const b = makeFlag({ heuristic: 'rapid_contact_burst', wallets: ['GB'] });
    for (const f of [a, b]) {
      store.dismiss({
        flagKey: computeFraudFlagDismissalKey(f),
        category: f.category,
        heuristic: f.heuristic,
        severity: f.severity,
        wallets: f.wallets,
        flagReason: f.reason,
        dismissedBy: 'GADMIN',
      });
    }

    const keys = store.getDismissedKeys();
    expect(keys.size).toBe(2);
    expect(keys.has(computeFraudFlagDismissalKey(a))).toBe(true);
    expect(keys.has(computeFraudFlagDismissalKey(b))).toBe(true);
  });

  it('re-dismissing the same key updates note/dismisser instead of duplicating', () => {
    const flag = makeFlag();
    const key = computeFraudFlagDismissalKey(flag);
    store.dismiss({
      flagKey: key,
      category: flag.category,
      heuristic: flag.heuristic,
      severity: flag.severity,
      wallets: flag.wallets,
      flagReason: flag.reason,
      note: 'first note',
      dismissedBy: 'GADMIN1',
    });
    const second = store.dismiss({
      flagKey: key,
      category: flag.category,
      heuristic: flag.heuristic,
      severity: flag.severity,
      wallets: flag.wallets,
      flagReason: flag.reason,
      note: 'revised note',
      dismissedBy: 'GADMIN2',
    });

    expect(second.note).toBe('revised note');
    expect(second.dismissedBy).toBe('GADMIN2');
    expect(store.listAll()).toHaveLength(1);
  });
});

describe('computeFraudFlagDismissalKey', () => {
  it('is independent of wallet array order', () => {
    const a = makeFlag({
      heuristic: 'concentrated_redeemer',
      wallets: ['GX', 'GY'],
    });
    const b = makeFlag({
      heuristic: 'concentrated_redeemer',
      wallets: ['GY', 'GX'],
    });
    expect(computeFraudFlagDismissalKey(a)).toBe(computeFraudFlagDismissalKey(b));
  });

  it('changes when severity changes', () => {
    const medium = makeFlag({ severity: 'medium' });
    const high = makeFlag({ severity: 'high' });
    expect(computeFraudFlagDismissalKey(medium)).not.toBe(
      computeFraudFlagDismissalKey(high),
    );
  });
});
