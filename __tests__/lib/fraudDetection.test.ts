import {
  analyzeReferralAbuse,
  analyzePayToContactAbuse,
} from '../../lib/fraudDetection';
import type { ReferralCode } from '../../types';
import type { ActivityEvent } from '../../lib/api';

function hasFlag(
  flags: { heuristic: string; wallets: string[] }[],
  heuristic: string,
  wallet?: string,
): boolean {
  return flags.some(
    (f) => f.heuristic === heuristic && (!wallet || f.wallets.includes(wallet)),
  );
}

describe('analyzeReferralAbuse — self-redemption', () => {
  test('flags a code redeemed by the wallet that generated it', () => {
    const codes: ReferralCode[] = [
      { code: 'A', scoutWallet: 'S1', createdAt: 0, usedBy: 'S1', usedAt: 10 },
    ];
    expect(hasFlag(analyzeReferralAbuse(codes), 'self_redemption', 'S1')).toBe(
      true,
    );
  });

  test('does not flag redemption by a different wallet', () => {
    const codes: ReferralCode[] = [
      { code: 'A', scoutWallet: 'S1', createdAt: 0, usedBy: 'R1', usedAt: 10 },
    ];
    expect(hasFlag(analyzeReferralAbuse(codes), 'self_redemption')).toBe(false);
  });
});

describe('analyzeReferralAbuse — fast redemption pattern', () => {
  test('flags a scout whose redemptions are nearly all near-instant', () => {
    const codes: ReferralCode[] = Array.from({ length: 5 }, (_, i) => ({
      code: `F${i}`,
      scoutWallet: 'S2',
      createdAt: 0,
      usedBy: `R${i}`,
      usedAt: 5_000, // well within FAST_REDEMPTION_MS, diverse redeemers
    }));
    expect(
      hasFlag(analyzeReferralAbuse(codes), 'fast_redemption_pattern', 'S2'),
    ).toBe(true);
  });

  test('does not flag below the minimum redemption volume', () => {
    const codes: ReferralCode[] = [
      { code: 'G1', scoutWallet: 'S3', createdAt: 0, usedBy: 'R1', usedAt: 10 },
      { code: 'G2', scoutWallet: 'S3', createdAt: 0, usedBy: 'R2', usedAt: 10 },
    ];
    expect(
      hasFlag(analyzeReferralAbuse(codes), 'fast_redemption_pattern', 'S3'),
    ).toBe(false);
  });
});

describe('analyzeReferralAbuse — concentrated redeemer', () => {
  test('flags a scout whose redemptions are dominated by one redeemer', () => {
    const codes: ReferralCode[] = Array.from({ length: 6 }, (_, i) => ({
      code: `C${i}`,
      scoutWallet: 'S4',
      createdAt: i * 1_000_000,
      usedBy: i < 5 ? 'R-SAME' : 'R-OTHER', // 5/6 = 83%
      usedAt: i * 1_000_000 + 999_999, // slow — avoids also tripping fast-redemption
    }));
    const flags = analyzeReferralAbuse(codes);
    expect(hasFlag(flags, 'concentrated_redeemer', 'S4')).toBe(true);
    const flag = flags.find((f) => f.heuristic === 'concentrated_redeemer');
    expect(flag?.severity).toBe('high');
  });

  test('does not flag a high-volume, diverse, organic referral pattern', () => {
    // Simulates an academy generating many legitimate referrals — high
    // volume, but every redemption is from a distinct wallet and happens
    // on a human timescale. This is the false-positive case the design
    // doc calls out explicitly.
    const codes: ReferralCode[] = Array.from({ length: 50 }, (_, i) => ({
      code: `L${i}`,
      scoutWallet: 'ACADEMY',
      createdAt: i * 10_000_000,
      usedBy: `PLAYER${i}`,
      usedAt: i * 10_000_000 + 5_000_000,
    }));
    const flags = analyzeReferralAbuse(codes).filter((f) =>
      f.wallets.includes('ACADEMY'),
    );
    expect(flags).toHaveLength(0);
  });
});

describe('analyzeReferralAbuse — cross-scout redeemer ring', () => {
  test('flags one wallet redeeming codes from many distinct scouts', () => {
    const codes: ReferralCode[] = ['SC1', 'SC2', 'SC3', 'SC4', 'SC5'].map(
      (scout, i) => ({
        code: `RING${i}`,
        scoutWallet: scout,
        createdAt: 0,
        usedBy: 'RING-WALLET',
        usedAt: 99_999_999, // slow, avoids also tripping fast-redemption
      }),
    );
    expect(
      hasFlag(
        analyzeReferralAbuse(codes),
        'cross_scout_redeemer_ring',
        'RING-WALLET',
      ),
    ).toBe(true);
  });

  test('does not flag a redeemer touching only a couple of scouts', () => {
    const codes: ReferralCode[] = ['SC1', 'SC2'].map((scout, i) => ({
      code: `SMALL${i}`,
      scoutWallet: scout,
      createdAt: 0,
      usedBy: 'CASUAL-REDEEMER',
      usedAt: 99_999_999,
    }));
    expect(
      hasFlag(
        analyzeReferralAbuse(codes),
        'cross_scout_redeemer_ring',
        'CASUAL-REDEEMER',
      ),
    ).toBe(false);
  });
});

function contactEvent(actor: string, timestampSec: number): ActivityEvent {
  return {
    id: `${actor}-${timestampSec}`,
    type: 'player_contacted',
    timestamp: timestampSec,
    actor,
  };
}

function subscribeEvent(actor: string, timestampSec: number): ActivityEvent {
  return {
    id: `${actor}-sub-${timestampSec}`,
    type: 'scout_subscribed',
    timestamp: timestampSec,
    actor,
  };
}

describe('analyzePayToContactAbuse — rapid contact burst', () => {
  test('flags a scout with many contacts in a tight window', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      contactEvent('SCOUT-BOT', i * 30),
    );
    expect(
      hasFlag(
        analyzePayToContactAbuse(events),
        'rapid_contact_burst',
        'SCOUT-BOT',
      ),
    ).toBe(true);
  });

  test('does not flag a busy human scout below the burst threshold', () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      contactEvent('BUSY-SCOUT', i * 120),
    );
    expect(
      hasFlag(
        analyzePayToContactAbuse(events),
        'rapid_contact_burst',
        'BUSY-SCOUT',
      ),
    ).toBe(false);
  });
});

describe('analyzePayToContactAbuse — subscription cycling', () => {
  test('flags repeated subscribe-then-one-contact-then-churn cycles', () => {
    const events: ActivityEvent[] = [];
    for (let i = 0; i < 6; i++) {
      events.push(subscribeEvent('CYCLER', i * 86_400));
      events.push(contactEvent('CYCLER', i * 86_400 + 10));
    }
    const flags = analyzePayToContactAbuse(events);
    expect(hasFlag(flags, 'subscription_cycling', 'CYCLER')).toBe(true);
    const flag = flags.find((f) => f.heuristic === 'subscription_cycling');
    expect(flag?.severity).toBe('high');
  });

  test('does not flag an infrequent but legitimate scout', () => {
    const events: ActivityEvent[] = [
      subscribeEvent('CASUAL', 0),
      contactEvent('CASUAL', 10),
      contactEvent('CASUAL', 20),
    ];
    expect(
      hasFlag(
        analyzePayToContactAbuse(events),
        'subscription_cycling',
        'CASUAL',
      ),
    ).toBe(false);
  });
});
