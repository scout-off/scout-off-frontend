import { locales, defaultLocale } from '@/lib/locales';

describe('lib/locales', () => {
  // ── locales array ────────────────────────────────────────────────────────────

  describe('locales', () => {
    test('contains exactly three entries', () => {
      expect(locales).toHaveLength(3);
    });

    test('includes "en"', () => {
      expect(locales).toContain('en');
    });

    test('includes "fr"', () => {
      expect(locales).toContain('fr');
    });

    test('includes "sw"', () => {
      expect(locales).toContain('sw');
    });

    test('locales.includes("en") returns true', () => {
      expect(locales.includes('en')).toBe(true);
    });

    test('locales.includes("fr") returns true', () => {
      expect(locales.includes('fr')).toBe(true);
    });

    test('locales.includes("sw") returns true', () => {
      expect(locales.includes('sw')).toBe(true);
    });

    test('locales.includes("de") returns false (unsupported locale)', () => {
      expect(locales.includes('de')).toBe(false);
    });

    test('locales.includes("") returns false (empty string)', () => {
      expect(locales.includes('')).toBe(false);
    });

    test('locales.includes("EN") returns false (case-sensitive)', () => {
      expect(locales.includes('EN')).toBe(false);
    });

    test('locales.includes("FR") returns false (case-sensitive)', () => {
      expect(locales.includes('FR')).toBe(false);
    });

    test('locales.includes("pt") returns false (unrelated locale)', () => {
      expect(locales.includes('pt')).toBe(false);
    });
  });

  // ── defaultLocale constant ────────────────────────────────────────────────────

  describe('defaultLocale', () => {
    test('is "en"', () => {
      expect(defaultLocale).toBe('en');
    });

    test('is included in the locales array', () => {
      expect(locales).toContain(defaultLocale);
    });
  });
});
