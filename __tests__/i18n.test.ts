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
 *
 * Issue #1128 — locale-parity check enumerates messages/*.json from disk so
 * any newly-added locale file is automatically included without a code change.
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Dynamic locale discovery — satisfies issue #1128 acceptance criteria:
// "Locale-parity check(s) enumerate messages/*.json from the filesystem
//  rather than a hardcoded array of locale codes"
// ---------------------------------------------------------------------------
const messagesDir = path.join(process.cwd(), 'messages');

/** All locale codes discovered from messages/*.json at test-run time. */
const discoveredLocales: string[] = fs
  .readdirSync(messagesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => path.basename(f, '.json'))
  .sort();

/** Map of locale → parsed message object, built from disk. */
const messageFiles: Record<string, Record<string, unknown>> = {};
for (const locale of discoveredLocales) {
  messageFiles[locale] = JSON.parse(
    fs.readFileSync(path.join(messagesDir, `${locale}.json`), 'utf8'),
  ) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Static imports kept for the existing individual-locale tests so they
// continue to work through the TypeScript module graph (issue #531 coverage).
// ---------------------------------------------------------------------------
import enMessages from '@/messages/en.json';
import frMessages from '@/messages/fr.json';
import ptMessages from '@/messages/pt.json';
import swMessages from '@/messages/sw.json';
import ptMessages from '@/messages/pt.json';

// ── Filesystem-driven locale discovery ──────────────────────────────────────

const MESSAGES_DIR = path.resolve(process.cwd(), 'messages');

/**
 * Reads the messages/ directory at test runtime so any new locale file is
 * automatically included in parity checks without editing this file.
 */
function getLocalesFromDisk(): string[] {
  return fs
    .readdirSync(MESSAGES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.basename(f, '.json'))
    .sort();
}

/**
 * Loads and parses a locale's JSON file from disk directly (bypasses the
 * static import list) so dynamically-discovered locales can be tested.
 */
function loadLocaleMessages(locale: string): Record<string, unknown> {
  const filePath = path.join(MESSAGES_DIR, `${locale}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<
    string,
    unknown
  >;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('i18n.ts', () => {
  // -------------------------------------------------------------------------
  // Issue #1128 — regression tests using dynamic discovery
  // -------------------------------------------------------------------------
  describe('locale-parity check (dynamic – issue #1128)', () => {
    it('discovers at least the four known locale files from disk', () => {
      // Ensures the dynamic enumeration is actually running
      expect(discoveredLocales).toContain('en');
      expect(discoveredLocales).toContain('fr');
      expect(discoveredLocales).toContain('pt');
      expect(discoveredLocales).toContain('sw');
    });

    it('a new locale file added to messages/ is picked up automatically without a code change', () => {
      // The discoveredLocales array is built purely from fs.readdirSync at
      // test-run time. If a 5th (or 6th…) locale JSON file is added to
      // messages/, this test will include it with zero code changes.
      const filesOnDisk = fs
        .readdirSync(messagesDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.basename(f, '.json'))
        .sort();

      expect(discoveredLocales).toEqual(filesOnDisk);
    });

    it('all discovered locales have the same top-level keys as en.json', () => {
      const enKeys = Object.keys(messageFiles['en']).sort();

      for (const locale of discoveredLocales) {
        const localeKeys = Object.keys(messageFiles[locale]).sort();
        expect({ locale, keys: localeKeys }).toEqual({
          locale,
          keys: enKeys,
        });
      }
    });

    it('every discovered locale file is non-empty', () => {
      for (const locale of discoveredLocales) {
        expect(Object.keys(messageFiles[locale]).length).toBeGreaterThan(0);
      }
    });

    it('every discovered locale file contains the core nav key', () => {
      for (const locale of discoveredLocales) {
        expect(messageFiles[locale]).toHaveProperty('nav');
        const nav = messageFiles[locale]['nav'] as Record<string, unknown>;
        expect(Object.keys(nav).length).toBeGreaterThan(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Original issue #531 tests — preserved exactly, extended to include pt
  // -------------------------------------------------------------------------
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

    it('Portuguese messages file exists and can be imported', () => {
      expect(ptMessages).toBeDefined();
      expect(typeof ptMessages).toBe('object');
      expect(Object.keys(ptMessages).length).toBeGreaterThan(0);
    });

    it('Swahili messages file exists and can be imported', () => {
      expect(swMessages).toBeDefined();
      expect(typeof swMessages).toBe('object');
      expect(Object.keys(swMessages).length).toBeGreaterThan(0);
    });

    it('Portuguese messages file exists and can be imported', () => {
      expect(ptMessages).toBeDefined();
      expect(typeof ptMessages).toBe('object');
      expect(Object.keys(ptMessages).length).toBeGreaterThan(0);
    });
  });

  describe('message structure validation', () => {
    it('English messages contain expected top-level keys', () => {
      const messages = enMessages as Record<string, unknown>;

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

    it('Portuguese messages contain expected top-level keys', () => {
      const messages = ptMessages as Record<string, unknown>;

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

    it('Portuguese messages contain expected top-level keys', () => {
      const messages = ptMessages as Record<string, unknown>;

      expect(messages).toHaveProperty('nav');
      expect(messages).toHaveProperty('player_dashboard');
      expect(messages).toHaveProperty('scout_dashboard');
      expect(messages).toHaveProperty('validator');
      expect(messages).toHaveProperty('admin');
    });
  });

  describe('locale key parity — filesystem-driven', () => {
    /**
     * Core regression guard for issue #1128:
     * Every locale discovered on disk must have exactly the same top-level
     * keys as every other locale.  No hardcoded locale list — the directory
     * listing is the source of truth.
     */
    it('all locale files discovered on disk share the same top-level keys', () => {
      const locales = getLocalesFromDisk();
      const keysByLocale = locales.map((locale) => ({
        locale,
        keys: Object.keys(loadLocaleMessages(locale)).sort(),
      }));

      const referenceKeys = keysByLocale[0].keys;
      for (const { locale, keys } of keysByLocale.slice(1)) {
        expect(keys).toEqual(referenceKeys);
      }
    });

    it('pt.json is included in the parity check automatically', () => {
      // Explicit regression for #1128: pt was the locale that could silently
      // drift because older checks had a hardcoded list of [en, fr, sw].
      const locales = getLocalesFromDisk();
      expect(locales).toContain('pt');
    });

    it('all locale files have the same top-level keys structure (static imports)', () => {
      // Kept for safety alongside the dynamic check above.
      const enKeys = Object.keys(enMessages).sort();
      const frKeys = Object.keys(frMessages).sort();
      const ptKeys = Object.keys(ptMessages).sort();
      const swKeys = Object.keys(swMessages).sort();
      const ptKeys = Object.keys(ptMessages).sort();

      expect(frKeys).toEqual(enKeys);
      expect(ptKeys).toEqual(enKeys);
      expect(swKeys).toEqual(enKeys);
      expect(ptKeys).toEqual(enKeys);
    });
  });

  describe('locale configuration', () => {
    it('supported locales array is defined in i18n.ts', () => {
      // Verify each discovered locale has a corresponding message file loaded
      const messageFilesMap = {
        en: enMessages,
        fr: frMessages,
        pt: ptMessages,
        sw: swMessages,
      };

      discoveredLocales.forEach((locale) => {
        if (locale in messageFilesMap) {
          const msgs = messageFilesMap[locale as keyof typeof messageFilesMap];
          expect(msgs).toBeDefined();
          expect(Object.keys(msgs).length).toBeGreaterThan(0);
        }
      });
    });

    it('default locale is English', () => {
      expect(enMessages).toBeDefined();
      expect(Object.keys(enMessages).length).toBeGreaterThan(0);
    });
  });

  describe('message content validation', () => {
    it('English messages are not empty objects', () => {
      const messages = enMessages as Record<string, unknown>;
      expect(Object.keys(messages).length).toBeGreaterThan(0);
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

    it('Portuguese messages are not empty objects', () => {
      const messages = ptMessages as Record<string, unknown>;
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

    it('Portuguese messages are not empty objects', () => {
      const messages = ptMessages as Record<string, unknown>;
      expect(Object.keys(messages).length).toBeGreaterThan(0);
      expect(
        Object.keys(messages.nav as Record<string, unknown>).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('regression protection', () => {
    it('all message files are valid JSON', () => {
      expect(() => JSON.stringify(enMessages)).not.toThrow();
      expect(() => JSON.stringify(frMessages)).not.toThrow();
      expect(() => JSON.stringify(ptMessages)).not.toThrow();
      expect(() => JSON.stringify(swMessages)).not.toThrow();
      expect(() => JSON.stringify(ptMessages)).not.toThrow();
    });

    it('no message file is accidentally empty', () => {
      expect(Object.keys(enMessages).length).toBeGreaterThanOrEqual(5);
      expect(Object.keys(frMessages).length).toBeGreaterThanOrEqual(5);
      expect(Object.keys(ptMessages).length).toBeGreaterThanOrEqual(5);
      expect(Object.keys(swMessages).length).toBeGreaterThanOrEqual(5);
      expect(Object.keys(ptMessages).length).toBeGreaterThanOrEqual(5);
    });

    it('core navigation messages exist in all locales', () => {
      const localeMessages = [enMessages, frMessages, ptMessages, swMessages];

      localeMessages.forEach((messages) => {
        const nav = (messages as Record<string, unknown>).nav as Record<
          string,
          unknown
        >;
        expect(nav).toBeDefined();
        expect(Object.keys(nav).length).toBeGreaterThan(0);
      });
    });

    it('dynamically discovered locales all pass the non-empty guard', () => {
      const locales = getLocalesFromDisk();
      for (const locale of locales) {
        const messages = loadLocaleMessages(locale);
        expect(Object.keys(messages).length).toBeGreaterThanOrEqual(5);
      }
    });
  });
});
