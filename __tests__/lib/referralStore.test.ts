/**
 * Unit tests for the referral store retention / archiving policy.
 *
 * These tests exercise pruneStaleEntries directly with controlled timestamps
 * so we don't need real time-based waiting.
 */
import fs from 'fs';
import path from 'path';
import {
  pruneStaleEntries,
  generateCode,
  redeemCode,
  getAllCodes,
  getSuccessfulCount,
  MAX_ENTRIES,
  MAX_BYTES,
  UNUSED_RETENTION_MS,
  USED_RETENTION_MS,
  type ReferralEntry,
} from '@/lib/referralStore';

// ── Helpers ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'referrals.json');

/** Clean the live store file before each test so tests are isolated. */
function cleanStore() {
  try {
    fs.unlinkSync(STORE_FILE);
  } catch {
    // File doesn't exist — fine
  }
}

function makeEntry(
  overrides: Partial<ReferralEntry> & { code: string; createdAt: string },
): ReferralEntry {
  return {
    scoutWallet: 'GA7QYNF7S3QZSTARF3Q7ZTH4I3VY6LFX3XKXZ7T3WX4N5O6P7Q8R9S0T',
    usedBy: null,
    usedAt: null,
    ...overrides,
  };
}

// ── pruneStaleEntries ─────────────────────────────────────────────────────────

describe('pruneStaleEntries', () => {
  it('keeps recently-created unused codes', () => {
    const nowMs = 1_800_000_000_000; // fixed anchor
    const created = new Date(nowMs).toISOString(); // now

    const entries: ReferralEntry[] = [
      makeEntry({ code: 'SCOUT-A1', createdAt: created }),
    ];

    const result = pruneStaleEntries(entries, nowMs);

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('SCOUT-A1');
  });

  it('archives unused codes older than UNUSED_RETENTION_MS', () => {
    const nowMs = 1_800_000_000_000;
    const oldDate = new Date(nowMs - UNUSED_RETENTION_MS - 1).toISOString();

    const entries: ReferralEntry[] = [
      makeEntry({ code: 'SCOUT-OLD', createdAt: oldDate }),
    ];

    const result = pruneStaleEntries(entries, nowMs);

    // Everything should be pruned
    expect(result).toHaveLength(0);
  });

  it('keeps recently-redeemed used codes', () => {
    const nowMs = 1_800_000_000_000;
    const created = new Date(nowMs - UNUSED_RETENTION_MS - 1000).toISOString();
    const used = new Date(nowMs).toISOString(); // just redeemed

    const entries: ReferralEntry[] = [
      makeEntry({
        code: 'SCOUT-USED',
        createdAt: created,
        usedBy: 'GA...USER',
        usedAt: used,
      }),
    ];

    const result = pruneStaleEntries(entries, nowMs);

    // Used codes live longer — still kept even though old
    expect(result).toHaveLength(1);
  });

  it('archives used codes older than USED_RETENTION_MS', () => {
    const nowMs = 1_800_000_000_000;
    const created = new Date(nowMs - USED_RETENTION_MS - 2).toISOString();
    const used = new Date(nowMs - USED_RETENTION_MS - 1).toISOString();

    const entries: ReferralEntry[] = [
      makeEntry({
        code: 'SCOUT-OLD-USED',
        createdAt: created,
        usedBy: 'GA...USER',
        usedAt: used,
      }),
    ];

    const result = pruneStaleEntries(entries, nowMs);

    // Old enough to be pruned even though it was used
    expect(result).toHaveLength(0);
  });

  it('keeps mixed group — archives only stale entries', () => {
    const nowMs = 1_800_000_000_000;
    const recent = new Date(nowMs).toISOString();
    const old = new Date(nowMs - UNUSED_RETENTION_MS - 1).toISOString();

    const entries: ReferralEntry[] = [
      makeEntry({ code: 'SCOUT-1', createdAt: recent }), // kept
      makeEntry({ code: 'SCOUT-2', createdAt: old }), // pruned
      makeEntry({ code: 'SCOUT-3', createdAt: recent }), // kept
      makeEntry({ code: 'SCOUT-4', createdAt: old }), // pruned
    ];

    const result = pruneStaleEntries(entries, nowMs);

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.code).sort()).toEqual(['SCOUT-1', 'SCOUT-3']);
  });

  it('returns empty array for empty input', () => {
    expect(pruneStaleEntries([])).toEqual([]);
  });
});

// ── Public API (integration-style) ─────────────────────────────────────────────

describe('generateCode / redeemCode / getSuccessfulCount', () => {
  beforeEach(cleanStore);

  it('generates a code and stores it', () => {
    const entry = generateCode('GA...SCOUT');

    expect(entry.code).toMatch(/^SCOUT-/);
    expect(entry.scoutWallet).toBe('GA...SCOUT');
    expect(entry.usedBy).toBeNull();

    const all = getAllCodes();
    expect(all.find((e) => e.code === entry.code)).toBeTruthy();
  });

  it('redeems an unused code', () => {
    const entry = generateCode('GA...SCOUT');

    const redeemed = redeemCode(entry.code, 'GA...PLAYER');

    expect(redeemed).not.toBeNull();
    expect(redeemed!.usedBy).toBe('GA...PLAYER');
    expect(redeemed!.usedAt).toBeTruthy();
  });

  it('returns null when redeeming an already-used code', () => {
    const entry = generateCode('GA...SCOUT');
    redeemCode(entry.code, 'GA...PLAYER');

    const second = redeemCode(entry.code, 'GA...OTHER');

    expect(second).toBeNull();
  });

  it('returns null for non-existent code', () => {
    expect(redeemCode('SCOUT-NOPE', 'GA...USER')).toBeNull();
  });

  it('getSuccessfulCount returns correct count', () => {
    expect(getSuccessfulCount()).toBe(0);

    const e1 = generateCode('GA...S1');
    const e2 = generateCode('GA...S2');
    redeemCode(e1.code, 'GA...P1');

    expect(getSuccessfulCount()).toBe(1);
  });
});

// ── Configuration exports ─────────────────────────────────────────────────────

describe('configuration constants', () => {
  it('MAX_ENTRIES is positive', () => {
    expect(MAX_ENTRIES).toBeGreaterThan(0);
  });

  it('MAX_BYTES is at least 100 KB', () => {
    expect(MAX_BYTES).toBeGreaterThanOrEqual(100 * 1024);
  });

  it('UNUSED_RETENTION_MS is at least 30 days', () => {
    expect(UNUSED_RETENTION_MS).toBeGreaterThanOrEqual(
      30 * 24 * 60 * 60 * 1000,
    );
  });

  it('USED_RETENTION_MS is at least 90 days', () => {
    expect(USED_RETENTION_MS).toBeGreaterThanOrEqual(90 * 24 * 60 * 60 * 1000);
  });
});
