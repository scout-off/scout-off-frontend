import { getTextDirection, isRtlLocale } from '@/lib/rtl';

// The module's internal RTL_LOCALES set is `['ar', 'he', 'fa', 'ur']`.
const RTL_LOCALES = ['ar', 'he', 'fa', 'ur'] as const;
// The app's actually-supported locales (see lib/locales).
const SUPPORTED_LOCALES = ['en', 'fr', 'sw'] as const;
// An arbitrary unrelated string that is neither supported nor RTL.
const ARBITRARY_LOCALE = 'xx';

describe('lib/rtl', () => {
  // ── isRtlLocale ─────────────────────────────────────────────────────────────

  describe('isRtlLocale', () => {
    test.each(RTL_LOCALES)('returns true for RTL locale "%s"', (locale) => {
      expect(isRtlLocale(locale)).toBe(true);
    });

    test.each(SUPPORTED_LOCALES)(
      'returns false for supported non-RTL locale "%s"',
      (locale) => {
        expect(isRtlLocale(locale)).toBe(false);
      },
    );

    test(`returns false for arbitrary unrelated locale "${ARBITRARY_LOCALE}"`, () => {
      expect(isRtlLocale(ARBITRARY_LOCALE)).toBe(false);
    });
  });

  // ── getTextDirection ──────────────────────────────────────────────────────────

  describe('getTextDirection', () => {
    test.each(RTL_LOCALES)('returns "rtl" for RTL locale "%s"', (locale) => {
      expect(getTextDirection(locale)).toBe('rtl');
    });

    test.each(SUPPORTED_LOCALES)(
      'returns "ltr" for supported non-RTL locale "%s"',
      (locale) => {
        expect(getTextDirection(locale)).toBe('ltr');
      },
    );

    test(`returns "ltr" (not an error) for arbitrary unrecognized locale "${ARBITRARY_LOCALE}"`, () => {
      expect(getTextDirection(ARBITRARY_LOCALE)).toBe('ltr');
    });
  });
});
