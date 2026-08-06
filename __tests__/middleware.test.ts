/**
 * Unit tests for middleware.ts locale routing
 *
 * Tests the locale configuration used by middleware.ts. Since middleware runs
 * in the Next.js Edge runtime with special APIs not available in Jest, we test
 * the underlying locale configuration rather than the middleware function itself.
 *
 * Full routing behavior is verified by E2E tests.
 *
 * Issue #530
 */

import { locales, defaultLocale } from '@/lib/locales';

describe('middleware.ts locale configuration', () => {
  describe('locale configuration', () => {
    it('supported locales are defined', () => {
      expect(locales).toBeDefined();
      expect(Array.isArray(locales)).toBe(true);
      expect(locales.length).toBeGreaterThan(0);
    });

    it('default locale is defined', () => {
      expect(defaultLocale).toBeDefined();
      expect(typeof defaultLocale).toBe('string');
      expect(defaultLocale.length).toBeGreaterThan(0);
    });

    it('default locale is in supported locales', () => {
      expect(locales).toContain(defaultLocale);
    });

    it('supported locales include en, fr, sw', () => {
      expect(locales).toContain('en');
      expect(locales).toContain('fr');
      expect(locales).toContain('sw');
    });

    it('default locale is English', () => {
      expect(defaultLocale).toBe('en');
    });

    it('locale configuration has exactly 3 supported locales', () => {
      // ScoutOff supports en, fr, sw — this ensures no accidental additions/removals
      expect(locales.length).toBe(3);
      expect(locales).toContain('en');
      expect(locales).toContain('fr');
      expect(locales).toContain('sw');
    });
  });

  describe('middleware file structure', () => {
    it('middleware.ts file exists in project', () => {
      // Verify the middleware file exists by checking if the module path resolves
      // We don't import it because it requires Next.js Edge runtime APIs
      const fs = require('fs');
      const path = require('path');
      const middlewarePath = path.join(process.cwd(), 'middleware.ts');

      expect(fs.existsSync(middlewarePath)).toBe(true);
    });
  });

  describe('regression protection', () => {
    it('locale list never becomes empty', () => {
      expect(locales.length).toBeGreaterThan(0);
    });

    it('default locale always exists', () => {
      expect(defaultLocale).toBeTruthy();
      expect(defaultLocale.length).toBeGreaterThanOrEqual(2);
    });

    it('default locale is always a supported locale', () => {
      expect(locales).toContain(defaultLocale);
    });

    it('all locales are valid ISO 639-1 codes', () => {
      // en, fr, sw are all valid 2-letter ISO 639-1 language codes
      locales.forEach((locale) => {
        expect(typeof locale).toBe('string');
        expect(locale.length).toBe(2);
        expect(locale).toMatch(/^[a-z]{2}$/);
      });
    });
  });
});
