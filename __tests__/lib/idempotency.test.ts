import { createIdempotencyKey } from '@/lib/idempotency';

describe('createIdempotencyKey', () => {
  describe('when crypto.randomUUID is available', () => {
    it('returns a string', () => {
      const key = createIdempotencyKey();
      expect(typeof key).toBe('string');
    });

    it('returns a non-empty string', () => {
      const key = createIdempotencyKey();
      expect(key.length).toBeGreaterThan(0);
    });

    it('returns a UUID v4 formatted string when crypto.randomUUID is available', () => {
      // jsdom provides crypto.randomUUID in the test environment
      if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
      ) {
        const key = createIdempotencyKey();
        expect(key).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
      }
    });

    it('returns a different key on each call (uniqueness)', () => {
      const keys = new Set(Array.from({ length: 50 }, () => createIdempotencyKey()));
      expect(keys.size).toBe(50);
    });
  });

  describe('fallback when crypto.randomUUID is not available', () => {
    let originalRandomUUID: typeof crypto.randomUUID | undefined;

    beforeEach(() => {
      originalRandomUUID = crypto.randomUUID;
      // @ts-expect-error intentionally removing to test fallback
      crypto.randomUUID = undefined;
    });

    afterEach(() => {
      if (originalRandomUUID !== undefined) {
        crypto.randomUUID = originalRandomUUID;
      }
    });

    it('returns a string with the idem- prefix', () => {
      const key = createIdempotencyKey();
      expect(key).toMatch(/^idem-/);
    });

    it('includes a timestamp component', () => {
      const before = Date.now();
      const key = createIdempotencyKey();
      const after = Date.now();
      const parts = key.split('-');
      // format is idem-<timestamp>-<random>
      const timestamp = parseInt(parts[1], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('includes a random suffix after the timestamp', () => {
      const key = createIdempotencyKey();
      const parts = key.split('-');
      // idem - <timestamp> - <random>
      expect(parts.length).toBeGreaterThanOrEqual(3);
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it('returns distinct keys across multiple calls (uniqueness)', () => {
      const keys = new Set(Array.from({ length: 50 }, () => createIdempotencyKey()));
      expect(keys.size).toBe(50);
    });
  });

  describe('fallback when crypto is entirely unavailable', () => {
    let originalCrypto: typeof globalThis.crypto;

    beforeEach(() => {
      originalCrypto = globalThis.crypto;
      // @ts-expect-error intentionally removing crypto to test fallback
      delete globalThis.crypto;
    });

    afterEach(() => {
      globalThis.crypto = originalCrypto;
    });

    it('still returns a non-empty string', () => {
      const key = createIdempotencyKey();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('returns a key with the idem- prefix', () => {
      const key = createIdempotencyKey();
      expect(key).toMatch(/^idem-/);
    });
  });
});
