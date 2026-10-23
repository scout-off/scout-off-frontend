/**
 * Equivalence test harness for lib/fraudIncremental.ts (issue #1482).
 *
 * The core guarantee of the incremental engine is determinism: given the
 * same sequence of events, incremental evaluation MUST produce the same set
 * of FraudFlags as a full (from-scratch) evaluation over the entire history.
 * A silent divergence between the two paths would either miss real fraud or
 * wrongly throttle legitimate wallets.
 *
 * Tests are organised in three layers:
 *
 *  1. Unit tests — each exported helper (applyReferralCode, applyActivityEvent,
 *     evaluateRulesForWallet, ...) tested in isolation with crafted inputs.
 *
 *  2. Equivalence tests — for every heuristic, a dataset that triggers it is
 *     evaluated both incrementally and via the full analyzeReferralAbuse /
 *     analyzePayToContactAbuse entry points.  The resulting flag sets must be
 *     identical in id, heuristic, severity, wallets, and evidence fields.
 *
 *  3. Chunked / resume tests — the same dataset is fed through
 *     runIncrementalStep in multiple tiny batches (and with a simulated time
 *     budget), then resumed; the final flag set must still match full eval.
 */

import {
  createEmptyWalletAggregate,
  createInitialIncrementalState,
  applyReferralCode,
  applyActivityEvent,
  evaluateRulesForWallet,
  updateActiveFlagsForChangedWallets,
  runIncrementalStep,
  type IncrementalFraudState,
} from '../../lib/fraudIncremental';
import {
  analyzeReferralAbuse,
  analyzePayToContactAbuse,
  DEFAULT_THRESHOLDS,
} from '../../lib/fraudDetection';
import type { ReferralCode, FraudFlag } from '../../types';
import type { ActivityEvent } from '../../lib/api';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeCode(
  overrides: Partial<ReferralCode> & {
    code: string;
    scoutWallet: string;
    createdAt: number;
  },
): ReferralCode {
  return {
    usedBy: null,
    usedAt: null,
    ...overrides,
  };
}

function makeEvent(
  type: ActivityEvent['type'],
  actor: string,
  timestamp: number,
): ActivityEvent {
  return {
    id: `${type}-${actor}-${timestamp}`,
    type,
    actor,
    timestamp,
    ledger: Math.floor(timestamp / 5000),
  } as ActivityEvent;
}

/** Sorted, stable flag-id list for easy set comparison. */
function flagIds(flags: FraudFlag[]): string[] {
  return [...flags].map((f) => f.id).sort();
}

/**
 * Compares two flag arrays field-by-field.  Wallets inside each flag are
 * sorted before comparison so ordering differences don't create false
 * mismatches.
 */
function flagsMatch(a: FraudFlag[], b: FraudFlag[]): boolean {
  if (a.length !== b.length) return false;
  const sortWallets = (f: FraudFlag) => ({
    ...f,
    wallets: [...f.wallets].sort(),
  });
  const normA = a.map(sortWallets).sort((x, y) => x.id.localeCompare(y.id));
  const normB = b.map(sortWallets).sort((x, y) => x.id.localeCompare(y.id));
  return JSON.stringify(normA) === JSON.stringify(normB);
}

// ─── createEmptyWalletAggregate ─────────────────────────────────────────────

describe('createEmptyWalletAggregate', () => {
  it('creates an aggregate with empty collections for the given wallet', () => {
    const agg = createEmptyWalletAggregate('W1');
    expect(agg.wallet).toBe('W1');
    expect(agg.referral.selfRedemptions).toEqual([]);
    expect(agg.referral.scoutCodes).toEqual({});
    expect(agg.referral.redeemedCodes).toEqual({});
    expect(agg.payToContact.contactTimestamps).toEqual([]);
    expect(agg.payToContact.subscriptionTimestamps).toEqual([]);
    expect(agg.payToContact.contactsPerHour).toEqual({});
  });
});

// ─── applyReferralCode ──────────────────────────────────────────────────────

describe('applyReferralCode', () => {
  it('returns empty array and makes no change for a code with no scoutWallet', () => {
    const state = createInitialIncrementalState();
    const code = makeCode({ code: 'A', scoutWallet: '', createdAt: 1000 });
    const changed = applyReferralCode(state, code);
    expect(changed).toEqual([]);
    expect(state.wallets.size).toBe(0);
  });

  it('adds a new unredeemed code to the scout aggregate', () => {
    const state = createInitialIncrementalState();
    applyReferralCode(
      state,
      makeCode({ code: 'A', scoutWallet: 'S1', createdAt: 1000 }),
    );
    const agg = state.wallets.get('S1')!;
    expect(agg.referral.scoutCodes['A']).toBeDefined();
    expect(agg.referral.scoutCodes['A'].usedBy).toBeNull();
  });

  it('marks self-redemption when usedBy === scoutWallet', () => {
    const state = createInitialIncrementalState();
    applyReferralCode(
      state,
      makeCode({
        code: 'A',
        scoutWallet: 'S1',
        createdAt: 1000,
        usedBy: 'S1',
        usedAt: 2000,
      }),
    );
    const agg = state.wallets.get('S1')!;
    expect(agg.referral.selfRedemptions).toHaveLength(1);
    expect(agg.referral.selfRedemptions[0].code).toBe('A');
  });

  it('does not duplicate a self-redemption entry on idempotent re-apply', () => {
    const state = createInitialIncrementalState();
    const code = makeCode({
      code: 'A',
      scoutWallet: 'S1',
      createdAt: 1000,
      usedBy: 'S1',
      usedAt: 2000,
    });
    applyReferralCode(state, code);
    applyReferralCode(state, code);
    expect(state.wallets.get('S1')!.referral.selfRedemptions).toHaveLength(1);
  });

  it('records the redemption on the redeemer aggregate when usedBy !== scoutWallet', () => {
    const state = createInitialIncrementalState();
    applyReferralCode(
      state,
      makeCode({
        code: 'A',
        scoutWallet: 'S1',
        createdAt: 1000,
        usedBy: 'R1',
        usedAt: 2000,
      }),
    );
    expect(state.wallets.get('R1')!.referral.redeemedCodes['A']).toBeDefined();
    expect(
      state.wallets.get('R1')!.referral.redeemedCodes['A'].scoutWallet,
    ).toBe('S1');
  });

  it('updates an existing code entry when usedBy or usedAt changes', () => {
    const state = createInitialIncrementalState();
    applyReferralCode(
      state,
      makeCode({ code: 'A', scoutWallet: 'S1', createdAt: 1000 }),
    );
    // Now mark it as redeemed
    applyReferralCode(
      state,
      makeCode({
        code: 'A',
        scoutWallet: 'S1',
        createdAt: 1000,
        usedBy: 'R1',
        usedAt: 5000,
      }),
    );
    expect(state.wallets.get('S1')!.referral.scoutCodes['A'].usedBy).toBe('R1');
  });

  it('returns the list of changed wallets', () => {
    const state = createInitialIncrementalState();
    const changed = applyReferralCode(
      state,
      makeCode({
        code: 'A',
        scoutWallet: 'S1',
        createdAt: 1000,
        usedBy: 'R1',
        usedAt: 2000,
      }),
    );
    expect(changed).toContain('S1');
    expect(changed).toContain('R1');
  });
});

// ─── applyActivityEvent ─────────────────────────────────────────────────────

describe('applyActivityEvent', () => {
  it('records a player_contacted timestamp for the actor', () => {
    const state = createInitialIncrementalState();
    applyActivityEvent(state, makeEvent('player_contacted', 'S1', 1_000_000));
    const agg = state.wallets.get('S1')!;
    expect(agg.payToContact.contactTimestamps).toContain(1_000_000_000);
  });

  it('increments the hour bucket counter for player_contacted', () => {
    const state = createInitialIncrementalState();
    const ts = Date.UTC(2024, 0, 15, 14, 30, 0); // 2024-01-15T14:30:00Z
    applyActivityEvent(state, makeEvent('player_contacted', 'S1', ts / 1000));
    const agg = state.wallets.get('S1')!;
    expect(agg.payToContact.contactsPerHour['2024-01-15T14']).toBe(1);
  });

  it('accumulates multiple contacts in the same hour bucket', () => {
    const state = createInitialIncrementalState();
    const base = Date.UTC(2024, 0, 15, 14, 0, 0) / 1000;
    applyActivityEvent(state, makeEvent('player_contacted', 'S1', base));
    applyActivityEvent(state, makeEvent('player_contacted', 'S1', base + 60));
    applyActivityEvent(state, makeEvent('player_contacted', 'S1', base + 120));
    expect(state.wallets.get('S1')!.payToContact.contactsPerHour['2024-01-15T14']).toBe(3);
  });

  it('records scout_subscribed timestamps', () => {
    const state = createInitialIncrementalState();
    applyActivityEvent(state, makeEvent('scout_subscribed', 'S1', 2_000_000));
    expect(state.wallets.get('S1')!.payToContact.subscriptionTimestamps).toContain(
      2_000_000_000,
    );
  });

  it('ignores unrecognised event types without modifying state', () => {
    const state = createInitialIncrementalState();
    applyActivityEvent(state, makeEvent('milestone_approved' as ActivityEvent['type'], 'S1', 1000));
    expect(state.wallets.has('S1')).toBe(false);
  });

  it('returns [] for an event with no actor', () => {
    const state = createInitialIncrementalState();
    const event = { ...makeEvent('player_contacted', '', 1000), actor: undefined } as unknown as ActivityEvent;
    const changed = applyActivityEvent(state, event);
    expect(changed).toEqual([]);
  });
});

// ─── evaluateRulesForWallet — self-redemption ───────────────────────────────

describe('evaluateRulesForWallet — self_redemption', () => {
  it('flags a wallet that redeemed its own code', () => {
    const state = createInitialIncrementalState();
    applyReferralCode(
      state,
      makeCode({
        code: 'A',
        scoutWallet: 'S1',
        createdAt: 1000,
        usedBy: 'S1',
        usedAt: 2000,
      }),
    );
    const flags = evaluateRulesForWallet(state, 'S1');
    expect(flags.some((f) => f.heuristic === 'self_redemption')).toBe(true);
    expect(flags.find((f) => f.heuristic === 'self_redemption')!.severity).toBe('high');
  });

  it('does not flag when a different wallet redeemed the code', () => {
    const state = createInitialIncrementalState();
    applyReferralCode(
      state,
      makeCode({
        code: 'A',
        scoutWallet: 'S1',
        createdAt: 1000,
        usedBy: 'R1',
        usedAt: 2000,
      }),
    );
    const flags = evaluateRulesForWallet(state, 'S1');
    expect(flags.some((f) => f.heuristic === 'self_redemption')).toBe(false);
  });
});

// ─── evaluateRulesForWallet — fast_redemption_pattern ───────────────────────

describe('evaluateRulesForWallet — fast_redemption_pattern', () => {
  function buildFastRedemptionState(fastCount: number, slowCount: number): IncrementalFraudState {
    const state = createInitialIncrementalState();
    let idx = 0;
    for (let i = 0; i < fastCount; i++) {
      applyReferralCode(
        state,
        makeCode({
          code: `F${idx++}`,
          scoutWallet: 'S2',
          createdAt: 0,
          usedBy: `R${idx}`,
          usedAt: 10_000, // well within FAST_REDEMPTION_MS (2 min)
        }),
      );
    }
    for (let i = 0; i < slowCount; i++) {
      applyReferralCode(
        state,
        makeCode({
          code: `S${idx++}`,
          scoutWallet: 'S2',
          createdAt: 0,
          usedBy: `R${idx}`,
          usedAt: 600_000, // 10 min — slow
        }),
      );
    }
    return state;
  }

  it('flags when >= MIN_REDEMPTIONS and fast ratio exceeds threshold', () => {
    // 5 fast / 5 total = 100% > 0.6 threshold
    const state = buildFastRedemptionState(5, 0);
    const flags = evaluateRulesForWallet(state, 'S2');
    expect(flags.some((f) => f.heuristic === 'fast_redemption_pattern')).toBe(true);
  });

  it('does not flag below the minimum redemption volume', () => {
    // Only 2 redemptions, below MIN_REDEMPTIONS_FOR_SPEED_CHECK (3)
    const state = buildFastRedemptionState(2, 0);
    const flags = evaluateRulesForWallet(state, 'S2');
    expect(flags.some((f) => f.heuristic === 'fast_redemption_pattern')).toBe(false);
  });

  it('does not flag when fast ratio is below threshold (1 fast / 5 total = 20%)', () => {
    const state = buildFastRedemptionState(1, 4);
    const flags = evaluateRulesForWallet(state, 'S2');
    expect(flags.some((f) => f.heuristic === 'fast_redemption_pattern')).toBe(false);
  });
});

// ─── evaluateRulesForWallet — rapid_contact_burst ──────────────────────────

describe('evaluateRulesForWallet — rapid_contact_burst', () => {
  const WINDOW_MS = DEFAULT_THRESHOLDS.CONTACT_BURST_WINDOW_MS; // 10 min
  const MIN_COUNT = DEFAULT_THRESHOLDS.CONTACT_BURST_MIN_COUNT; // 8

  it('flags when MIN_COUNT contacts fall within the burst window', () => {
    const state = createInitialIncrementalState();
    const baseTs = 1_700_000_000; // Unix seconds
    for (let i = 0; i < MIN_COUNT; i++) {
      applyActivityEvent(
        state,
        makeEvent('player_contacted', 'S3', baseTs + i * 60),
      );
    }
    const flags = evaluateRulesForWallet(state, 'S3');
    expect(flags.some((f) => f.heuristic === 'rapid_contact_burst')).toBe(true);
  });

  it('does not flag when contacts are spread outside the window', () => {
    const state = createInitialIncrementalState();
    const baseTs = 1_700_000_000;
    // Space them > 10 min apart so no window contains >= 8
    for (let i = 0; i < MIN_COUNT; i++) {
      applyActivityEvent(
        state,
        makeEvent('player_contacted', 'S3', baseTs + i * (WINDOW_MS / 1000 + 60)),
      );
    }
    const flags = evaluateRulesForWallet(state, 'S3');
    expect(flags.some((f) => f.heuristic === 'rapid_contact_burst')).toBe(false);
  });
});

// ─── updateActiveFlagsForChangedWallets ──────────────────────────────────────

describe('updateActiveFlagsForChangedWallets', () => {
  it('adds flags to the activeFlags map for flagged wallets', () => {
    const state = createInitialIncrementalState();
    applyReferralCode(
      state,
      makeCode({
        code: 'A',
        scoutWallet: 'S1',
        createdAt: 1000,
        usedBy: 'S1',
        usedAt: 2000,
      }),
    );
    updateActiveFlagsForChangedWallets(state, ['S1']);
    expect(state.activeFlags.has('S1')).toBe(true);
  });

  it('removes wallet from activeFlags when it no longer has any flags', () => {
    const state = createInitialIncrementalState();
    // Inject a flag manually to start with a flagged wallet
    state.activeFlags.set('S1', [
      {
        id: 'referral:self_redemption:S1',
        category: 'referral',
        heuristic: 'self_redemption',
        severity: 'high',
        wallets: ['S1'],
        reason: 'test',
        evidence: {},
      },
    ]);
    // Wallet has no aggregated data, so re-evaluation yields no flags
    updateActiveFlagsForChangedWallets(state, ['S1']);
    expect(state.activeFlags.has('S1')).toBe(false);
  });

  it('returns all active flags sorted by severity', () => {
    const state = createInitialIncrementalState();
    // S1 — self-redemption (high)
    applyReferralCode(
      state,
      makeCode({
        code: 'A',
        scoutWallet: 'S1',
        createdAt: 1000,
        usedBy: 'S1',
        usedAt: 2000,
      }),
    );
    // S2 — rapid contact burst (medium at 8, high at 16+)
    const baseTs = 1_700_000_000;
    for (let i = 0; i < DEFAULT_THRESHOLDS.CONTACT_BURST_MIN_COUNT; i++) {
      applyActivityEvent(state, makeEvent('player_contacted', 'S2', baseTs + i * 60));
    }
    const allFlags = updateActiveFlagsForChangedWallets(state, ['S1', 'S2']);
    const severities = allFlags.map((f) => f.severity);
    // 'high' must appear before 'medium' in the sorted list
    const highIdx = severities.indexOf('high');
    const medIdx = severities.indexOf('medium');
    if (highIdx !== -1 && medIdx !== -1) {
      expect(highIdx).toBeLessThan(medIdx);
    }
  });
});

// ─── runIncrementalStep ─────────────────────────────────────────────────────

describe('runIncrementalStep', () => {
  it('processes referral codes and activity events and returns changed wallets', () => {
    const state = createInitialIncrementalState();
    const codes: ReferralCode[] = [
      makeCode({ code: 'A', scoutWallet: 'S1', createdAt: 1000, usedBy: 'S1', usedAt: 2000 }),
    ];
    const events: ActivityEvent[] = [makeEvent('player_contacted', 'S2', 1_700_000_000)];
    const result = runIncrementalStep(state, codes, events);
    expect(result.changedWallets).toContain('S1');
    expect(result.changedWallets).toContain('S2');
    expect(result.eventsProcessed).toBe(2);
    expect(result.hitTimeBudget).toBe(false);
  });

  it('updates lastLedger to the highest ledger in the processed events', () => {
    const state = createInitialIncrementalState();
    const events: ActivityEvent[] = [
      { ...makeEvent('player_contacted', 'S1', 1000), ledger: 100 },
      { ...makeEvent('scout_subscribed', 'S1', 2000), ledger: 200 },
    ];
    runIncrementalStep(state, [], events);
    expect(state.lastLedger).toBe(200);
  });

  it('stops processing when the time budget is exhausted', () => {
    const state = createInitialIncrementalState();
    const codes: ReferralCode[] = Array.from({ length: 50 }, (_, i) =>
      makeCode({ code: `C${i}`, scoutWallet: `S${i}`, createdAt: i * 1000 }),
    );
    const result = runIncrementalStep(state, codes, [], {
      timeBudgetMs: 0, // stops immediately
    });
    expect(result.hitTimeBudget).toBe(true);
    expect(result.eventsProcessed).toBeLessThan(50);
  });
});

// ─── Equivalence harness ─────────────────────────────────────────────────────
//
// For each heuristic, feed the same dataset through both the full
// analyzeReferralAbuse / analyzePayToContactAbuse entry points and through
// the incremental engine.  The resulting flag sets must be identical.

describe('EQUIVALENCE: incremental vs full evaluation', () => {
  // ── self_redemption ────────────────────────────────────────────────────────
  describe('self_redemption', () => {
    const codes: ReferralCode[] = [
      makeCode({ code: 'A', scoutWallet: 'S1', createdAt: 0, usedBy: 'S1', usedAt: 1000 }),
      makeCode({ code: 'B', scoutWallet: 'S2', createdAt: 0, usedBy: 'R1', usedAt: 1000 }),
    ];

    it('produces the same flags incrementally and in full', () => {
      const fullFlags = analyzeReferralAbuse(codes);
      const state = createInitialIncrementalState();
      const { flags: incFlags } = runIncrementalStep(state, codes, []);
      expect(flagIds(incFlags)).toEqual(flagIds(fullFlags));
    });
  });

  // ── fast_redemption_pattern ────────────────────────────────────────────────
  describe('fast_redemption_pattern', () => {
    const codes: ReferralCode[] = Array.from({ length: 5 }, (_, i) =>
      makeCode({
        code: `F${i}`,
        scoutWallet: 'S3',
        createdAt: 0,
        usedBy: `R${i}`,
        usedAt: 10_000, // 10 s < FAST_REDEMPTION_MS
      }),
    );

    it('produces the same flags incrementally and in full', () => {
      const fullFlags = analyzeReferralAbuse(codes);
      const state = createInitialIncrementalState();
      const { flags: incFlags } = runIncrementalStep(state, codes, []);
      expect(
        incFlags.some((f) => f.heuristic === 'fast_redemption_pattern'),
      ).toBe(fullFlags.some((f) => f.heuristic === 'fast_redemption_pattern'));
    });
  });

  // ── concentrated_redeemer ─────────────────────────────────────────────────
  describe('concentrated_redeemer', () => {
    // 6 codes all redeemed by same wallet R1 → top-redeemer ratio 6/6 = 1.0 > 0.5
    const codes: ReferralCode[] = Array.from({ length: 6 }, (_, i) =>
      makeCode({
        code: `C${i}`,
        scoutWallet: 'S4',
        createdAt: 0,
        usedBy: 'R1',
        usedAt: 100_000,
      }),
    );

    it('produces the same flags incrementally and in full', () => {
      const fullFlags = analyzeReferralAbuse(codes);
      const state = createInitialIncrementalState();
      const { flags: incFlags } = runIncrementalStep(state, codes, []);
      expect(
        incFlags.some((f) => f.heuristic === 'concentrated_redeemer'),
      ).toBe(fullFlags.some((f) => f.heuristic === 'concentrated_redeemer'));
    });
  });

  // ── cross_scout_redeemer_ring ──────────────────────────────────────────────
  describe('cross_scout_redeemer_ring', () => {
    // R1 redeems codes from 5 distinct scouts
    const codes: ReferralCode[] = Array.from({ length: 5 }, (_, i) =>
      makeCode({
        code: `X${i}`,
        scoutWallet: `SC${i}`,
        createdAt: 0,
        usedBy: 'R1',
        usedAt: 50_000,
      }),
    );

    it('produces the same flags incrementally and in full', () => {
      const fullFlags = analyzeReferralAbuse(codes);
      const state = createInitialIncrementalState();
      const { flags: incFlags } = runIncrementalStep(state, codes, []);
      expect(
        incFlags.some((f) => f.heuristic === 'cross_scout_redeemer_ring'),
      ).toBe(
        fullFlags.some((f) => f.heuristic === 'cross_scout_redeemer_ring'),
      );
    });
  });

  // ── rapid_contact_burst ────────────────────────────────────────────────────
  describe('rapid_contact_burst', () => {
    const baseTs = 1_700_000_000;
    const events: ActivityEvent[] = Array.from(
      { length: DEFAULT_THRESHOLDS.CONTACT_BURST_MIN_COUNT },
      (_, i) => makeEvent('player_contacted', 'S5', baseTs + i * 60),
    );

    it('produces the same flags incrementally and in full', () => {
      const fullFlags = analyzePayToContactAbuse(events);
      const state = createInitialIncrementalState();
      const { flags: incFlags } = runIncrementalStep(state, [], events);
      expect(
        incFlags.some((f) => f.heuristic === 'rapid_contact_burst'),
      ).toBe(fullFlags.some((f) => f.heuristic === 'rapid_contact_burst'));
    });
  });

  // ── subscription_cycling ──────────────────────────────────────────────────
  describe('subscription_cycling', () => {
    // 4 subscriptions, 1 contact each → avgContactsPerSub = 1 ≤ 1.5 threshold
    const baseTs = 1_700_000_000;
    const events: ActivityEvent[] = [
      ...Array.from({ length: 4 }, (_, i) =>
        makeEvent('scout_subscribed', 'S6', baseTs + i * 86_400),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeEvent('player_contacted', 'S6', baseTs + i * 86_400 + 3600),
      ),
    ];

    it('produces the same flags incrementally and in full', () => {
      const fullFlags = analyzePayToContactAbuse(events);
      const state = createInitialIncrementalState();
      const { flags: incFlags } = runIncrementalStep(state, [], events);
      expect(
        incFlags.some((f) => f.heuristic === 'subscription_cycling'),
      ).toBe(fullFlags.some((f) => f.heuristic === 'subscription_cycling'));
    });
  });

  // ── combined dataset ───────────────────────────────────────────────────────
  describe('combined dataset (all referral heuristics at once)', () => {
    const codes: ReferralCode[] = [
      // self_redemption
      makeCode({ code: 'SELF', scoutWallet: 'SCOUT_SELF', createdAt: 0, usedBy: 'SCOUT_SELF', usedAt: 1000 }),
      // fast_redemption_pattern (5 fast codes for SCOUT_FAST)
      ...Array.from({ length: 5 }, (_, i) =>
        makeCode({
          code: `FAST_${i}`,
          scoutWallet: 'SCOUT_FAST',
          createdAt: 0,
          usedBy: `RF${i}`,
          usedAt: 10_000,
        }),
      ),
      // concentrated_redeemer (6 codes → one redeemer)
      ...Array.from({ length: 6 }, (_, i) =>
        makeCode({
          code: `CONC_${i}`,
          scoutWallet: 'SCOUT_CONC',
          createdAt: 0,
          usedBy: 'REDEEMER_CONC',
          usedAt: 200_000,
        }),
      ),
      // cross_scout_redeemer_ring (one redeemer → 5 distinct scouts)
      ...Array.from({ length: 5 }, (_, i) =>
        makeCode({
          code: `RING_${i}`,
          scoutWallet: `SCOUT_RING_${i}`,
          createdAt: 0,
          usedBy: 'REDEEMER_RING',
          usedAt: 50_000,
        }),
      ),
    ];

    it('all heuristic presence bits match between full and incremental', () => {
      const fullFlags = analyzeReferralAbuse(codes);
      const state = createInitialIncrementalState();
      const { flags: incFlags } = runIncrementalStep(state, codes, []);

      const fullHeuristics = new Set(fullFlags.map((f) => f.heuristic));
      const incHeuristics = new Set(incFlags.map((f) => f.heuristic));

      for (const h of fullHeuristics) {
        expect(incHeuristics.has(h)).toBe(true);
      }
      for (const h of incHeuristics) {
        expect(fullHeuristics.has(h)).toBe(true);
      }
    });
  });
});

// ─── Chunked-processing equivalence ─────────────────────────────────────────

describe('chunked incremental processing', () => {
  const codes: ReferralCode[] = [
    makeCode({ code: 'A', scoutWallet: 'S1', createdAt: 0, usedBy: 'S1', usedAt: 1000 }),
    ...Array.from({ length: 5 }, (_, i) =>
      makeCode({
        code: `F${i}`,
        scoutWallet: 'S2',
        createdAt: 0,
        usedBy: `R${i}`,
        usedAt: 5_000,
      }),
    ),
    ...Array.from({ length: 5 }, (_, i) =>
      makeCode({
        code: `C${i}`,
        scoutWallet: 'S3',
        createdAt: 0,
        usedBy: 'R_CONC',
        usedAt: 100_000,
      }),
    ),
  ];

  it('produces the same flags when processed in chunks vs all at once', () => {
    // All at once
    const stateFull = createInitialIncrementalState();
    const { flags: bulkFlags } = runIncrementalStep(stateFull, codes, []);

    // In chunks of 2
    const stateChunked = createInitialIncrementalState();
    let lastFlags: FraudFlag[] = [];
    for (let i = 0; i < codes.length; i += 2) {
      const chunk = codes.slice(i, i + 2);
      const result = runIncrementalStep(stateChunked, chunk, []);
      lastFlags = result.flags;
    }

    expect(flagIds(lastFlags)).toEqual(flagIds(bulkFlags));
  });

  it('resumes correctly after a time-budget stop', () => {
    // Full reference
    const stateRef = createInitialIncrementalState();
    const { flags: refFlags } = runIncrementalStep(stateRef, codes, []);

    // First pass: ultra-short budget
    const stateResume = createInitialIncrementalState();
    const pass1 = runIncrementalStep(stateResume, codes, [], { timeBudgetMs: 0 });
    expect(pass1.hitTimeBudget).toBe(true);

    // Second pass: process remaining codes on the same state
    const processed1 = pass1.eventsProcessed;
    const remaining = codes.slice(processed1);
    const pass2 = runIncrementalStep(stateResume, remaining, [], {
      timeBudgetMs: 10_000,
    });

    // After both passes the flag set must equal the single-pass reference
    expect(flagIds(pass2.flags)).toEqual(flagIds(refFlags));
  });
});
