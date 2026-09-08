/**
 * Unit tests for i18n message-file configuration.
 *
 * Ensures every supported locale has a message file that exists, parses,
 * and has the same top-level key structure as en.json. A regression here
 * would silently break translations for an entire locale.
 *
 * Issue #531 — per-locale availability/structure checks.
 * Issue #1128 — the locale-parity check enumerates messages/*.json from
 * disk rather than a hardcoded array, so a newly-added locale file is
 * picked up automatically without a code change.
 */

import fs from 'fs';
import path from 'path';

import enMessages from '@/messages/en.json';
import frMessages from '@/messages/fr.json';
import swMessages from '@/messages/sw.json';

const MESSAGES_DIR = path.join(process.cwd(), 'messages');

/** All locale codes discovered from messages/*.json at test-run time. */
const discoveredLocales: string[] = fs
  .readdirSync(MESSAGES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => path.basename(f, '.json'))
  .sort();

/** Loads and parses a locale's JSON file straight from disk. */
function loadLocaleMessages(locale: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), 'utf-8'),
  ) as Record<string, unknown>;
}

/** Map of locale → parsed message object, built from disk. */
const messageFiles: Record<string, Record<string, unknown>> = {};
for (const locale of discoveredLocales) {
  messageFiles[locale] = loadLocaleMessages(locale);
}

describe('i18n message files', () => {
  describe('locale discovery (issue #1128)', () => {
    it('discovers the known locale files from disk', () => {
      expect(discoveredLocales).toEqual(
        expect.arrayContaining(['en', 'fr', 'sw']),
      );
    });

    it('enumerates messages/ directly rather than a hardcoded list', () => {
      const filesOnDisk = fs
        .readdirSync(MESSAGES_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.basename(f, '.json'))
        .sort();
      expect(discoveredLocales).toEqual(filesOnDisk);
    });
  });

  describe('message file availability (issue #531)', () => {
    it.each([
      ['English', () => enMessages],
      ['French', () => frMessages],
      ['Swahili', () => swMessages],
    ])('%s messages file exists and can be imported', (_name, get) => {
      const messages = get();
      expect(messages).toBeDefined();
      expect(typeof messages).toBe('object');
      expect(Object.keys(messages).length).toBeGreaterThan(0);
    });
  });

  describe('message structure validation', () => {
    it.each([
      ['English', () => enMessages],
      ['French', () => frMessages],
      ['Swahili', () => swMessages],
    ])('%s messages contain the expected top-level keys', (_name, get) => {
      const messages = get() as Record<string, unknown>;
      expect(messages).toHaveProperty('nav');
      expect(messages).toHaveProperty('player_dashboard');
      expect(messages).toHaveProperty('scout_dashboard');
      expect(messages).toHaveProperty('validator');
      expect(messages).toHaveProperty('admin');
    });
  });

  describe('locale key parity — filesystem-driven (issue #1128)', () => {
    it('every discovered locale has the same top-level keys as en.json', () => {
      const enKeys = Object.keys(messageFiles['en']).sort();
      for (const locale of discoveredLocales) {
        expect({
          locale,
          keys: Object.keys(messageFiles[locale]).sort(),
        }).toEqual({ locale, keys: enKeys });
      }
    });

    it('every discovered locale file is non-empty and has a populated nav key', () => {
      for (const locale of discoveredLocales) {
        const messages = messageFiles[locale];
        expect(Object.keys(messages).length).toBeGreaterThanOrEqual(5);
        expect(messages).toHaveProperty('nav');
        expect(
          Object.keys(messages['nav'] as Record<string, unknown>).length,
        ).toBeGreaterThan(0);
      }
    });
  });

  describe('regression protection', () => {
    it('all message files are valid JSON', () => {
      for (const locale of discoveredLocales) {
        expect(() => JSON.stringify(messageFiles[locale])).not.toThrow();
      }
    });

    it('default locale English is present and non-empty', () => {
      expect(Object.keys(enMessages).length).toBeGreaterThan(0);
    });
  });
});
