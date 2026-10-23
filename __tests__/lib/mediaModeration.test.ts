/** @jest-environment node */
/**
 * Unit tests for lib/mediaModeration.ts (issue #1534).
 *
 * Covers:
 *   - MEDIA_REPORT_REASONS constant and MediaReportReason type
 *   - MEDIA_REPORT_REASON_LABELS – every reason has a non-empty label
 *   - isMediaReportReason – type guard / validation helper
 *   - isValidMediaCid – CID format check (permissive vs strict)
 *
 * isValidMediaCid is used by /api/media/denylist, /api/media/report and
 * /api/admin/media-moderation, so regressions here could admit malformed
 * CIDs into those routes.
 */
import {
  MEDIA_REPORT_REASONS,
  MEDIA_REPORT_REASON_LABELS,
  isMediaReportReason,
  isValidMediaCid,
} from '@/lib/mediaModeration';
import type { MediaReportReason } from '@/lib/mediaModeration';

// ---------------------------------------------------------------------------
// MEDIA_REPORT_REASONS
// ---------------------------------------------------------------------------

describe('MEDIA_REPORT_REASONS', () => {
  it('is a non-empty readonly tuple', () => {
    expect(MEDIA_REPORT_REASONS.length).toBeGreaterThan(0);
  });

  it('contains only strings', () => {
    for (const reason of MEDIA_REPORT_REASONS) {
      expect(typeof reason).toBe('string');
    }
  });

  it('contains the expected canonical reasons', () => {
    expect(MEDIA_REPORT_REASONS).toContain('nudity');
    expect(MEDIA_REPORT_REASONS).toContain('violence');
    expect(MEDIA_REPORT_REASONS).toContain('impersonation');
    expect(MEDIA_REPORT_REASONS).toContain('copyright');
    expect(MEDIA_REPORT_REASONS).toContain('other');
  });

  it('has no duplicate entries', () => {
    const unique = new Set(MEDIA_REPORT_REASONS);
    expect(unique.size).toBe(MEDIA_REPORT_REASONS.length);
  });
});

// ---------------------------------------------------------------------------
// MEDIA_REPORT_REASON_LABELS
// ---------------------------------------------------------------------------

describe('MEDIA_REPORT_REASON_LABELS', () => {
  it('has a label for every reason in MEDIA_REPORT_REASONS', () => {
    for (const reason of MEDIA_REPORT_REASONS) {
      expect(MEDIA_REPORT_REASON_LABELS[reason as MediaReportReason]).toEqual(
        expect.any(String),
      );
    }
  });

  it('has no empty labels', () => {
    for (const reason of MEDIA_REPORT_REASONS) {
      expect(
        MEDIA_REPORT_REASON_LABELS[reason as MediaReportReason].length,
      ).toBeGreaterThan(0);
    }
  });

  it('has no extra keys beyond what MEDIA_REPORT_REASONS defines', () => {
    const labelKeys = Object.keys(MEDIA_REPORT_REASON_LABELS).sort();
    const reasonKeys = [...MEDIA_REPORT_REASONS].sort();
    expect(labelKeys).toEqual(reasonKeys);
  });
});

// ---------------------------------------------------------------------------
// isMediaReportReason
// ---------------------------------------------------------------------------

describe('isMediaReportReason', () => {
  it.each([...MEDIA_REPORT_REASONS])(
    'returns true for valid reason "%s"',
    (reason) => {
      expect(isMediaReportReason(reason)).toBe(true);
    },
  );

  it('returns false for an unknown string', () => {
    expect(isMediaReportReason('spam')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isMediaReportReason('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isMediaReportReason(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isMediaReportReason(undefined)).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isMediaReportReason(0)).toBe(false);
  });

  it('returns false for an object', () => {
    expect(isMediaReportReason({ reason: 'nudity' })).toBe(false);
  });

  it('acts as a type guard narrowing to MediaReportReason', () => {
    const value: unknown = 'violence';
    if (isMediaReportReason(value)) {
      const _typed: MediaReportReason = value;
      expect(typeof _typed).toBe('string');
    } else {
      throw new Error('Expected isMediaReportReason to return true');
    }
  });
});

// ---------------------------------------------------------------------------
// isValidMediaCid
// ---------------------------------------------------------------------------

describe('isValidMediaCid – valid CIDs', () => {
  it('accepts a CIDv0 (Qm…, 46 chars)', () => {
    expect(
      isValidMediaCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'),
    ).toBe(true);
  });

  it('accepts a CIDv1 base32 (b…)', () => {
    expect(
      isValidMediaCid(
        'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      ),
    ).toBe(true);
  });

  it('accepts a CID with an optional file extension (.jpg)', () => {
    expect(
      isValidMediaCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG.jpg'),
    ).toBe(true);
  });

  it('accepts a CID with extension up to 8 chars (.mp4)', () => {
    expect(
      isValidMediaCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG.mp4'),
    ).toBe(true);
  });
});

describe('isValidMediaCid – invalid / non-string inputs', () => {
  it('rejects null', () => {
    expect(isValidMediaCid(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidMediaCid(undefined)).toBe(false);
  });

  it('rejects a number', () => {
    expect(isValidMediaCid(42)).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidMediaCid('')).toBe(false);
  });
});

describe('isValidMediaCid – format violations', () => {
  it('rejects a string shorter than 46 chars', () => {
    // 45 chars — one short
    expect(isValidMediaCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPb')).toBe(
      false,
    );
  });

  it('rejects a string longer than 100 chars', () => {
    expect(isValidMediaCid('b' + 'a'.repeat(100))).toBe(false);
  });

  it('rejects a path containing "/"', () => {
    expect(isValidMediaCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/evil')).toBe(
      false,
    );
  });

  it('rejects a CID with a "?" query character', () => {
    expect(isValidMediaCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG?x=1')).toBe(
      false,
    );
  });

  it('rejects a CID with a double extension (.jpg.exe)', () => {
    // Two dots — pattern only allows one optional extension
    expect(
      isValidMediaCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG.jpg.exe'),
    ).toBe(false);
  });

  it('rejects whitespace-padded CID', () => {
    expect(
      isValidMediaCid(
        ' QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      ),
    ).toBe(false);
  });
});
