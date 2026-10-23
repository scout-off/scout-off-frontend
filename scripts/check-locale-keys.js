#!/usr/bin/env node
/**
 * Compares keys across all messages/*.json locale files and fails if any
 * key present in one locale is missing from another, to catch untranslated
 * strings before merge.
 *
 * In addition to the original key-set comparison (issue #1503 extends this):
 *   1. ICU placeholder check — every locale value for a given key must use
 *      the same set of `{name}` / `{name, …}` placeholders. A mismatch makes
 *      next-intl throw at runtime (or render the raw message text), so this
 *      is a hard failure.
 *   2. Untranslated-copy check — flags any non-English value that is a
 *      verbatim copy of the English text. This is a *warning* by default
 *      (brand names, language names, and proper nouns are legitimately
 *      identical across locales) and becomes a hard failure when the
 *      `--strict-untranslated` flag is passed, or when a value is not in the
 *      allowlist below.
 */
const fs = require('fs');
const path = require('path');

const messagesDir = path.join(__dirname, '..', 'messages');

/**
 * Recursively walks a locale JSON object and returns all leaf-node key paths
 * as dot-separated strings (e.g. `"nav.home"`, `"errors.not_found"`).
 *
 * Arrays are treated as leaf values and are NOT recursed into — an array
 * produces a single path entry for its key, identical to a string or number
 * value.
 *
 * @param {Record<string, unknown>} obj   The (nested) object to flatten.
 * @param {string}                  prefix Accumulated key prefix for recursion.
 * @returns {string[]} Sorted array of dotted key paths.
 */
function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value, fullKey);
    }
    return [fullKey];
  });
}

/**
 * Returns a nested locale object as a flat { dottedKey: value } map. Used
 * internally so the placeholder- and untranslated-copy checks can compare
 * actual values, not just key sets.
 *
 * @param {Record<string, unknown>} obj The (nested) object to flatten.
 * @param {string}                  prefix Accumulated key prefix for recursion.
 * @returns {Record<string, unknown>} Dotted-key → value map.
 */
function flattenValues(obj, prefix = '') {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenValues(value, fullKey));
    } else {
      out[fullKey] = value;
    }
  }
  return out;
}

/**
 * Extracts the set of ICU MessageFormat argument names referenced in a
 * message string — e.g. `'{count, plural, one {# item} other {# items}}'`
 * → `Set(['count'])`, and `'Hello {name}, you have {n} messages'` →
 * `Set(['name', 'n'])`.
 *
 * Only top-level arguments are reported. Literal text *inside* a plural /
 * select / selectordinal clause (e.g. the words `time` / `times` in
 * `one {time} other {times}`) is NOT an argument — it's wording — so a naive
 * regex that matches every `{word}` would produce false mismatches across
 * locales that translate those words differently. This parser tracks brace
 * depth so it only records argument identifiers that appear at the
 * outermost `{...}` level, and skips the body of any typed argument
 * (plural / select / selectordinal / number / date / time) entirely.
 *
 * It also handles the `<tag>...</tag>` rich-text markers next-intl allows
 * (issue #1501's dispute modal uses `<highlight>...</highlight>`): those are
 * plain text to this check, since they contain no `{arg}`.
 *
 * Returns an empty set for non-string values (numbers, booleans, arrays are
 * identical by definition and have no placeholders).
 *
 * @param {unknown} value The locale value to scan.
 * @returns {Set<string>} Set of argument identifiers found.
 */
function extractPlaceholders(value) {
  if (typeof value !== 'string') return new Set();
  const names = new Set();
  let i = 0;
  const len = value.length;
  while (i < len) {
    if (value[i] !== '{') {
      i += 1;
      continue;
    }
    // Found an opening brace at the outermost level. Capture the identifier:
    // it runs until ',', '}', or whitespace.
    let j = i + 1;
    let name = '';
    while (
      j < len &&
      value[j] !== ',' &&
      value[j] !== '}' &&
      value[j] !== ' ' &&
      value[j] !== '\t'
    ) {
      name += value[j];
      j += 1;
    }
    // Skip optional whitespace between the name and the type separator.
    while (j < len && (value[j] === ' ' || value[j] === '\t')) j += 1;

    if (j < len && value[j] === ',') {
      // Typed argument (plural / select / selectordinal / number / date / …).
      // Record the argument name, then skip its entire body by walking to the
      // matching close brace at depth 1. The body is locale-specific wording
      // (it uses `#` for the count and may contain translated words that look
      // like `{word}`); capturing those as placeholders would produce false
      // mismatches across locales, so the body is skipped wholesale.
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      let depth = 1;
      j += 1;
      while (j < len && depth > 0) {
        if (value[j] === '{') depth += 1;
        else if (value[j] === '}') depth -= 1;
        j += 1;
      }
      i = j;
    } else if (j < len && value[j] === '}') {
      // Simple argument: `{name}`. Record it (only valid identifiers; `#`
      // and empty braces aren't arguments).
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      i = j + 1;
    } else {
      // Malformed, double-brace `{{` escape, or a `{` that isn't an argument.
      // Advance to avoid an infinite loop.
      i = j + 1;
    }
  }
  return names;
}

/**
 * Keys whose values are expected to be identical across locales — brand
 * names, language endonyms, and proper nouns. Listed here so the
 * untranslated-copy check doesn't flag them as missing translations.
 */
const UNTRANSLATED_ALLOWLIST = new Set([
  'app_title', // Brand name "ScoutOff"
  'language.english', // Endonym shown in the language picker
  'language.french',
  'language.swahili',
  'trial_offer.message', // Generic "Message" label
  'status.dependency_frontend', // "Frontend"
  'status.dependency_rpc', // "Soroban RPC / Horizon" (product name)
  'progress_levels.level2', // "Performance" (proper-noun badge label)
  'admin.code_singular', // "code" / "codes" (very short, ambiguous)
  'admin.code_plural',
  'actions.refresh', // Single short word, same in all three locales
  'settings.contact.telegram_label', // "Telegram" (proper noun)
  'scout.subscribe.tiers.pro.title', // "Pro" / "Elite" tier names
  'scout.subscribe.tiers.elite.title',
  // Short / borrowed terms identical in French and Swahili:
  'academy.bulkImport.columns.bio', // "Bio" (identical in fr/sw)
  'academy.bulkImport.pause', // "Pause" (identical in fr/sw)
  'notifications.title', // "Notifications" (identical in fr/sw)
  'privacy.section1_title', // "1. Introduction" (heading + number, identical in fr)
]);

module.exports = { flattenKeys, flattenValues, extractPlaceholders };

if (require.main === module) {
  const strictUntranslated = process.argv.includes('--strict-untranslated');

  const localeFiles = fs
    .readdirSync(messagesDir)
    .filter((f) => f.endsWith('.json'));

  /** @type {Record<string, Set<string>>} */
  const keysByLocale = {};
  /** @type {Record<string, Record<string, unknown>>} */
  const valuesByLocale = {};
  for (const file of localeFiles) {
    const locale = path.basename(file, '.json');
    const content = JSON.parse(
      fs.readFileSync(path.join(messagesDir, file), 'utf8'),
    );
    keysByLocale[locale] = new Set(flattenKeys(content));
    valuesByLocale[locale] = flattenValues(content);
  }

  const allKeys = new Set(
    Object.values(keysByLocale).flatMap((set) => [...set]),
  );

  // ── 1. Missing-key check (existing behavior) ──────────────────────────────
  let hasMismatch = false;
  for (const key of allKeys) {
    const missingIn = Object.entries(keysByLocale)
      .filter(([, keys]) => !keys.has(key))
      .map(([locale]) => locale);

    if (missingIn.length > 0) {
      hasMismatch = true;
      console.error(
        `Missing key "${key}" in locale(s): ${missingIn.join(', ')}`,
      );
    }
  }

  // ── 2. ICU placeholder mismatch check (hard failure) ───────────────────────
  let hasPlaceholderMismatch = false;
  for (const key of allKeys) {
    const perLocale = Object.fromEntries(
      Object.entries(valuesByLocale).map(([locale, values]) => [
        locale,
        extractPlaceholders(values[key]),
      ]),
    );
    // Canonical placeholder set = the union across all locales that have the
    // key. A locale is mismatched if its set differs from any other locale's.
    const presentLocales = Object.entries(perLocale)
      .filter(([, set]) => set.size >= 0) // keep all, even empty
      .map(([locale]) => locale);
    for (let i = 0; i < presentLocales.length; i += 1) {
      for (let j = i + 1; j < presentLocales.length; j += 1) {
        const a = presentLocales[i];
        const b = presentLocales[j];
        const setA = perLocale[a];
        const setB = perLocale[b];
        const missingInB = [...setA].filter((p) => !setB.has(p));
        const missingInA = [...setB].filter((p) => !setA.has(p));
        if (missingInB.length || missingInA.length) {
          hasPlaceholderMismatch = true;
          const detail = [
            missingInB.length &&
              `${a} has {${missingInB.join('}, {')}} missing in ${b}`,
            missingInA.length &&
              `${b} has {${missingInA.join('}, {')}} missing in ${a}`,
          ]
            .filter(Boolean)
            .join('; ');
          console.error(
            `Placeholder mismatch for key "${key}": ${detail}`,
          );
        }
      }
    }
  }

  // ── 3. Untranslated-copy check (warning, or hard failure with --strict) ─────
  let untranslatedCount = 0;
  let hasUntranslatedFailure = false;
  for (const key of allKeys) {
    if (UNTRANSLATED_ALLOWLIST.has(key)) continue;
    const enValue = valuesByLocale.en ? valuesByLocale.en[key] : undefined;
    if (typeof enValue !== 'string' || enValue.length < 3) continue;
    for (const [locale, values] of Object.entries(valuesByLocale)) {
      if (locale === 'en') continue;
      const value = values[key];
      if (typeof value === 'string' && value === enValue) {
        untranslatedCount += 1;
        const prefix = strictUntranslated ? '✖' : '⚠';
        if (strictUntranslated) hasUntranslatedFailure = true;
        const stream = strictUntranslated ? process.stderr : process.stderr;
        stream.write(
          `${prefix} "${key}" in ${locale} is identical to the English ` +
            `value (likely untranslated): ${JSON.stringify(value)}\n`,
        );
      }
    }
  }

  if (hasMismatch) {
    console.error(
      '\nLocale key check failed: some keys are missing translations.',
    );
    process.exit(1);
  }
  if (hasPlaceholderMismatch) {
    console.error(
      '\nLocale placeholder check failed: ICU placeholder names differ ' +
        'across locales (next-intl will throw at runtime).',
    );
    process.exit(1);
  }
  if (hasUntranslatedFailure) {
    console.error(
      '\nLocale check failed: ' +
        untranslatedCount +
        ' value(s) appear to be untranslated copies of English. ' +
        'Translate them, or add the key to UNTRANSLATED_ALLOWLIST in ' +
        'scripts/check-locale-keys.js if the identical value is intentional.',
    );
    process.exit(1);
  }

  if (untranslatedCount > 0) {
    console.warn(
      `\n${untranslatedCount} value(s) appear to be untranslated copies of ` +
        `English (treated as warnings). Run with --strict-untranslated to fail.`,
    );
  }

  console.log(
    `Locale key check passed for: ${Object.keys(keysByLocale).join(', ')}`,
  );
}
