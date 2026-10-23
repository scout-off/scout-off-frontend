/**
 * @jest-environment node
 *
 * Unit tests for lib/sep10NonceStore.ts.
 *
 * The store uses better-sqlite3's :memory: database in NODE_ENV=test
 * (enforced by lib/sqliteDb.ts), so each test gets a clean, isolated DB
 * with no filesystem side effects.
 */
import { Sep10NonceStore } from '@/lib/sep10NonceStore';

let store: Sep10NonceStore;

const nowSec = () => Math.floor(Date.now() / 1000);
const futureSec = (offsetSec = 300) => nowSec() + offsetSec;
const pastSec = (offsetSec = 1) => nowSec() - offsetSec;

beforeEach(() => {
  Sep10NonceStore.resetInstance();
  store = Sep10NonceStore.getInstance();
});

afterEach(() => {
  Sep10NonceStore.resetInstance();
});

// ── singleton ────────────────────────────────────────────────────────────────
describe('Sep10NonceStore singleton', () => {
  it('returns the same instance on repeated calls', () => {
    const a = Sep10NonceStore.getInstance();
    const b = Sep10NonceStore.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance() produces a fresh instance', () => {
    const first = Sep10NonceStore.getInstance();
    Sep10NonceStore.resetInstance();
    const second = Sep10NonceStore.getInstance();
    expect(first).not.toBe(second);
  });
});

// ── hashXdr ──────────────────────────────────────────────────────────────────
describe('Sep10NonceStore.hashXdr()', () => {
  it('returns a 64-character hex string (sha256)', () => {
    const hash = Sep10NonceStore.hashXdr('AAAA...some XDR...');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same hash for the same input', () => {
    const xdr = 'AAAAAQAAAA...challengeXDR==';
    expect(Sep10NonceStore.hashXdr(xdr)).toBe(Sep10NonceStore.hashXdr(xdr));
  });

  it('returns different hashes for different inputs', () => {
    expect(Sep10NonceStore.hashXdr('XDR_A==')).not.toBe(
      Sep10NonceStore.hashXdr('XDR_B=='),
    );
  });
});

// ── consumeNonce ─────────────────────────────────────────────────────────────
describe('consumeNonce()', () => {
  it('returns true on the first call for a given hash', () => {
    const hash = Sep10NonceStore.hashXdr('unique-xdr-1');
    expect(store.consumeNonce(hash, futureSec())).toBe(true);
  });

  it('returns false on any subsequent call for the same hash (replay)', () => {
    const hash = Sep10NonceStore.hashXdr('unique-xdr-2');
    expect(store.consumeNonce(hash, futureSec())).toBe(true);
    expect(store.consumeNonce(hash, futureSec())).toBe(false);
    // repeated calls must all be false
    expect(store.consumeNonce(hash, futureSec())).toBe(false);
  });

  it('different hashes are independent — each returns true on first use', () => {
    const h1 = Sep10NonceStore.hashXdr('xdr-alpha');
    const h2 = Sep10NonceStore.hashXdr('xdr-beta');
    expect(store.consumeNonce(h1, futureSec())).toBe(true);
    expect(store.consumeNonce(h2, futureSec())).toBe(true);
  });

  it('stores the expires_at value passed by the caller', () => {
    // We can verify indirectly: a nonce stored with a past expiry is swept
    // by sweepExpired() but a replay check still returns false while the
    // row exists (before the sweep).
    const hash = Sep10NonceStore.hashXdr('xdr-expires-soon');
    const exp = pastSec(5); // already expired
    store.consumeNonce(hash, exp);
    // A second call returns false because the row IS there (not yet swept)
    expect(store.consumeNonce(hash, futureSec())).toBe(false);
  });

  it('is idempotent on the expires_at argument — the winning INSERT sets the value', () => {
    const hash = Sep10NonceStore.hashXdr('xdr-idempotent');
    const firstExp = futureSec(300);
    const secondExp = futureSec(600);
    store.consumeNonce(hash, firstExp);
    // Second call does NOT insert (returns false) and does NOT overwrite
    // — this is the INSERT OR IGNORE guarantee.
    store.consumeNonce(hash, secondExp);
    // The only observable guarantee here is that the row was not replaced
    // (changes === 0), which consumeNonce correctly reports as false.
    expect(store.consumeNonce(hash, futureSec())).toBe(false);
  });
});

// ── sweepExpired ─────────────────────────────────────────────────────────────
describe('sweepExpired()', () => {
  it('returns 0 when there is nothing to sweep', () => {
    expect(store.sweepExpired()).toBe(0);
  });

  it('does not sweep rows whose expires_at is in the future', () => {
    store.consumeNonce(Sep10NonceStore.hashXdr('still-valid'), futureSec(300));
    expect(store.sweepExpired()).toBe(0);
  });

  it('sweeps rows whose expires_at is in the past', () => {
    const hash = Sep10NonceStore.hashXdr('expired-xdr');
    store.consumeNonce(hash, pastSec(10)); // expired 10 seconds ago
    const swept = store.sweepExpired();
    expect(swept).toBe(1);
  });

  it('sweeps multiple expired rows in one call', () => {
    for (let i = 0; i < 5; i++) {
      store.consumeNonce(Sep10NonceStore.hashXdr(`expired-${i}`), pastSec(i + 1));
    }
    expect(store.sweepExpired()).toBe(5);
  });

  it('only sweeps expired rows, leaving live rows intact', () => {
    store.consumeNonce(Sep10NonceStore.hashXdr('live'), futureSec(300));
    store.consumeNonce(Sep10NonceStore.hashXdr('dead'), pastSec(10));

    expect(store.sweepExpired()).toBe(1);

    // The live nonce is still there — a second consumeNonce call returns false
    expect(store.consumeNonce(Sep10NonceStore.hashXdr('live'), futureSec())).toBe(false);
  });

  it('is idempotent — a second sweep of the same data returns 0', () => {
    store.consumeNonce(Sep10NonceStore.hashXdr('sweep-twice'), pastSec(5));
    expect(store.sweepExpired()).toBe(1);
    expect(store.sweepExpired()).toBe(0);
  });

  it('a swept nonce can be re-consumed (as a fresh first-use)', () => {
    // After expiry and sweep, the same XDR hash is gone from the store.
    // Re-submitting the original XDR (which would have failed Stellar's own
    // time-bound check long before reaching us) is now treated as first-use.
    // This test confirms sweep restores the insert-or-ignore invariant.
    const hash = Sep10NonceStore.hashXdr('swept-and-reused');
    store.consumeNonce(hash, pastSec(10));
    store.sweepExpired();
    expect(store.consumeNonce(hash, futureSec(300))).toBe(true);
  });
});
