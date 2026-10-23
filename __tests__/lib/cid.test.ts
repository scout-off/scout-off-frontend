/** @jest-environment node */
/**
 * Unit tests for lib/cid.ts – isValidCid (issue #1528).
 *
 * isValidCid is a security boundary: it runs before a CID is interpolated
 * into an upstream gateway URL in app/api/media/[cid]/route.ts. Regressions
 * that widen the accepted set could open a path/query-injection vector.
 */
import { isValidCid, normalizeCid } from '@/lib/cid';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A canonical CIDv0 (46 chars, base58btc, starts with Qm). */
const VALID_V0 = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';

/** A canonical CIDv1 base32 lower-case (starts with 'b'). */
const VALID_V1_BASE32 =
  'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

/** A canonical CIDv1 base58btc (starts with 'z'). */
const VALID_V1_BASE58 = 'zdj7WWeQ43G6JJvLWQWZpyHuAMq6uYWRjkBXFad11vE2LHhQ7';

// ---------------------------------------------------------------------------
// Valid CIDs – should return true
// ---------------------------------------------------------------------------

describe('isValidCid – valid inputs', () => {
  it('accepts a canonical CIDv0 (Qm…, 46 chars)', () => {
    expect(isValidCid(VALID_V0)).toBe(true);
  });

  it('accepts a canonical CIDv1 base32 (b…)', () => {
    expect(isValidCid(VALID_V1_BASE32)).toBe(true);
  });

  it('accepts a canonical CIDv1 base58btc (z…)', () => {
    expect(isValidCid(VALID_V1_BASE58)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Non-string inputs – should return false
// ---------------------------------------------------------------------------

describe('isValidCid – non-string inputs', () => {
  it('rejects null', () => {
    expect(isValidCid(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidCid(undefined)).toBe(false);
  });

  it('rejects a number', () => {
    expect(isValidCid(42)).toBe(false);
  });

  it('rejects an object', () => {
    expect(isValidCid({})).toBe(false);
  });

  it('rejects an array', () => {
    expect(isValidCid(['QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'])).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Injection / path-traversal attempts – should return false
// ---------------------------------------------------------------------------

describe('isValidCid – injection / path-traversal rejection', () => {
  it('rejects a CID with a "/" character (path injection)', () => {
    expect(isValidCid('Qmfoo/../../etc/passwd')).toBe(false);
  });

  it('rejects a CID with a "?" character (query injection)', () => {
    expect(isValidCid('Qmfoo?evil=1')).toBe(false);
  });

  it('rejects a CID with a "#" fragment character', () => {
    expect(isValidCid('Qmfoo#section')).toBe(false);
  });

  it('rejects a CID with a "%" percent-encoded character', () => {
    expect(isValidCid('Qmfoo%2F..%2Fetc')).toBe(false);
  });

  it('rejects a CID with a "." dot character', () => {
    expect(isValidCid('Qmfoo.txt')).toBe(false);
  });

  it('rejects a URL-shaped string', () => {
    expect(isValidCid('https://example.com/path')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Format violations – should return false
// ---------------------------------------------------------------------------

describe('isValidCid – format violations', () => {
  it('rejects an empty string', () => {
    expect(isValidCid('')).toBe(false);
  });

  it('rejects a string that is too short for CIDv0 (< 46 chars, Qm prefix)', () => {
    // Qm + 43 base58 chars = 45 chars total — one short of the minimum
    expect(isValidCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPb')).toBe(
      false,
    );
  });

  it('rejects a string longer than MAX_CID_LENGTH (100 chars)', () => {
    const tooLong = 'b' + 'a'.repeat(100); // 101 chars
    expect(isValidCid(tooLong)).toBe(false);
  });

  it('rejects a CIDv0 with lowercase Qm (wrong case)', () => {
    // CIDv0 must start with uppercase 'Qm'
    const lower = 'qm' + VALID_V0.slice(2);
    expect(isValidCid(lower)).toBe(false);
  });

  it('rejects a CIDv1 base32 string that starts with "B" (uppercase)', () => {
    // CIDv1 base32 must be lower-case
    const upper = 'B' + VALID_V1_BASE32.slice(1);
    expect(isValidCid(upper)).toBe(false);
  });

  it('rejects a random alphanumeric string without a valid multibase prefix', () => {
    expect(isValidCid('notacidatall1234567890')).toBe(false);
  });

  it('rejects whitespace-padded CID', () => {
    expect(isValidCid(' ' + VALID_V0)).toBe(false);
    expect(isValidCid(VALID_V0 + ' ')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

describe('isValidCid – TypeScript type guard', () => {
  it('narrows the type to string when it returns true', () => {
    const value: unknown = VALID_V0;
    if (isValidCid(value)) {
      // TypeScript should treat `value` as `string` here
      const _s: string = value;
      expect(typeof _s).toBe('string');
    } else {
      // Should not reach here for a valid CID
      throw new Error('Expected isValidCid to return true');
    }
  });
});

// ── Upper-case base32 / base36 support and normalizeCid (#1586–#1589) ──────────

const V0 = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
const BASE32 = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const BASE36 = 'k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8';

describe('isValidCid', () => {
  it.each([V0, BASE32, BASE36])('accepts %s', (cid) => {
    expect(isValidCid(cid)).toBe(true);
  });

  it('accepts upper-case base32 and base36', () => {
    expect(isValidCid(BASE32.toUpperCase())).toBe(true);
    expect(isValidCid(BASE36.toUpperCase())).toBe(true);
  });

  it.each([
    V0.toLowerCase(), // base58 is case-sensitive
    `${BASE32}/../etc`,
    `${BASE32}?x=1`,
    `${BASE36}.html`,
    'bAfYbeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi', // mixed case
  ])('rejects %s', (cid) => {
    expect(isValidCid(cid)).toBe(false);
  });
});

describe('normalizeCid', () => {
  it('lower-cases upper-case base32 and base36', () => {
    expect(normalizeCid(BASE32.toUpperCase())).toBe(BASE32);
    expect(normalizeCid(BASE36.toUpperCase())).toBe(BASE36);
  });

  it('keeps a file extension as written', () => {
    expect(normalizeCid(`${BASE32.toUpperCase()}.JPG`)).toBe(`${BASE32}.JPG`);
  });

  it('leaves base58 and canonical CIDs unchanged', () => {
    expect(normalizeCid(V0)).toBe(V0);
    expect(normalizeCid(BASE32)).toBe(BASE32);
  });
});
