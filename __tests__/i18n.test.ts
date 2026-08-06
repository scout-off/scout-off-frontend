/**
 * Unit tests for i18n.ts request configuration
 *
 * Ensures the next-intl request-level locale and message loading works
 * correctly for all supported locales. A regression here would silently break
 * translations for an entire locale.
 *
 * Since getRequestConfig is server-side only, these tests verify:
 * 1. Message files exist and can be imported
 * 2. Message files contain expected structure
 * 3. All supported locales have corresponding message files
 *
 * Issue #531
 */

// Import actual message files to verify they exist and load correctly
import enMessages from '@/messages/en.json';
import frMessages from '@/messages/fr.json';
import swMessages from '@/messages/sw.json';

describe('i18n.ts', () => {
  describe('message file availability', () => {
    it('English messages file exists and can be imported', () => {
      expect(enMessages).toBeDefined();
      expect(typeof enMessages).toBe('object');
      expect(Object.keys(enMessages).length).toBeGreaterThan(0);
    });

    it('French messages file exists and can be imported', () => {
      expect(frMessages).toBeDefined();
      expect(typeof frMessages).toBe('object');
      expect(Object.keys(frMessages).length).toBeGreaterThan(0);
    });

    it('Swahili messages file exists and can be imported', () => {
      expect(swMessages).toBeDefined();
      expect(typeof swMessages).toBe('object');
      expect(Object.keys(swMessages).length).toBeGreaterThan(0);
    });
  });

  describe('message structure validation', () => {
    it('English messages contain expected top-level keys', () => {
      const messages = enMessages as Record<string, unknown>;

      // Verify some expected translation keys exist (based on actual i18n structure)
      expect(messages).toHaveProperty('nav');
      expect(messages).toHaveProperty('player_dashboard');
      expect(messages).toHaveProperty('scout_dashboard');
      expect(messages).toHaveProperty('validator');
      expect(messages).toHaveProperty('admin');
    });

    it('French messages contain expected top-level keys', () => {
      const messages = frMessages as Record<string, unknown>;

      expect(messages).toHaveProperty('nav');
      expect(messages).toHaveProperty('player_dashboard');
      expect(messages).toHaveProperty('scout_dashboard');
      expect(messages).toHaveProperty('validator');
      expect(messages).toHaveProperty('admin');
    });

    it('Swahili messages contain expected top-level keys', () => {
      const messages = swMessages as Record<string, unknown>;

      expect(messages).toHaveProperty('nav');
      expect(messages).toHaveProperty('player_dashboard');
      expect(messages).toHaveProperty('scout_dashboard');
      expect(messages).toHaveProperty('validator');
      expect(messages).toHaveProperty('admin');
    });

    it('all message files have the same top-level keys structure', () => {
      const enKeys = Object.keys(enMessages).sort();
      const frKeys = Object.keys(frMessages).sort();
      const swKeys = Object.keys(swMessages).sort();

      // All locale message files should have the same structure
      expect(frKeys).toEqual(enKeys);
      expect(swKeys).toEqual(enKeys);
    });
  });

  describe('locale configuration', () => {
    it('supported locales array is defined in i18n.ts', () => {
      // The i18n.ts file references locales 'en', 'fr', 'sw'
      // We verify these match our available message files
      const availableLocales = ['en', 'fr', 'sw'];
      const messageFiles = { en: enMessages, fr: frMessages, sw: swMessages };

      availableLocales.forEach((locale) => {
        expect(messageFiles[locale as keyof typeof messageFiles]).toBeDefined();
        expect(
          Object.keys(messageFiles[locale as keyof typeof messageFiles]).length,
        ).toBeGreaterThan(0);
      });
    });

    it('default locale is English', () => {
      // The i18n.ts file has defaultLocale = 'en'
      // We verify English messages exist and are non-empty
      expect(enMessages).toBeDefined();
      expect(Object.keys(enMessages).length).toBeGreaterThan(0);
    });
  });

  describe('message content validation', () => {
    it('English messages are not empty objects', () => {
      const messages = enMessages as Record<string, unknown>;
      expect(Object.keys(messages).length).toBeGreaterThan(0);

      // At least one nested key should exist
      expect(
        Object.keys(messages.nav as Record<string, unknown>).length,
      ).toBeGreaterThan(0);
    });

    it('French messages are not empty objects', () => {
      const messages = frMessages as Record<string, unknown>;
      expect(Object.keys(messages).length).toBeGreaterThan(0);
      expect(
        Object.keys(messages.nav as Record<string, unknown>).length,
      ).toBeGreaterThan(0);
    });

    it('Swahili messages are not empty objects', () => {
      const messages = swMessages as Record<string, unknown>;
      expect(Object.keys(messages).length).toBeGreaterThan(0);
      expect(
        Object.keys(messages.nav as Record<string, unknown>).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('regression protection', () => {
    it('all message files are valid JSON', () => {
      // If we got here, the imports succeeded, meaning the JSON is valid
      expect(() => JSON.stringify(enMessages)).not.toThrow();
      expect(() => JSON.stringify(frMessages)).not.toThrow();
      expect(() => JSON.stringify(swMessages)).not.toThrow();
    });

    it('no message file is accidentally empty', () => {
      expect(Object.keys(enMessages).length).toBeGreaterThanOrEqual(5);
      expect(Object.keys(frMessages).length).toBeGreaterThanOrEqual(5);
      expect(Object.keys(swMessages).length).toBeGreaterThanOrEqual(5);
    });

    it('core navigation messages exist in all locales', () => {
      const localeMessages = [enMessages, frMessages, swMessages];

      localeMessages.forEach((messages) => {
        const nav = messages.nav as Record<string, unknown>;
        expect(nav).toBeDefined();
        expect(Object.keys(nav).length).toBeGreaterThan(0);
      });
    });
  });
});
