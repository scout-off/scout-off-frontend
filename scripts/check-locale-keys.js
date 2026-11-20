#!/usr/bin/env node
/**
 * Compares keys across all messages/*.json locale files and fails if any
 * key present in one locale is missing from another, to catch untranslated
 * strings before merge.
 *
 * Also reports (without failing) per-locale human-review coverage from
 * i18n/review-status.json and ICU plural categories that the locale does not
 * use (issue #1719). The report is appended to the GitHub Actions job
 * summary when GITHUB_STEP_SUMMARY is set.
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
 * Returns `{ reviewed, total, percent }` for a locale. Keys absent from the
 * status map count as machine-translated.
 *
 * @param {string[]} keys
 * @param {Record<string, { status: string }>} [statusMap]
 */
function reviewCoverage(keys, statusMap = {}) {
  const reviewed = keys.filter(
    (k) => statusMap[k] && statusMap[k].status === 'reviewed',
  ).length;
  const total = keys.length;
  const percent = total === 0 ? 100 : (reviewed / total) * 100;
  return { reviewed, total, percent };
}

/**
 * Lists ICU plural selectors in `message` whose categories are not used by
 * `locale` (per Intl.PluralRules). Exact matches (`=0`) are always valid.
 *
 * @param {string} message
 * @param {string} locale
 * @returns {string[]}
 */
function invalidPluralCategories(message, locale) {
  if (typeof message !== 'string' || !message.includes('plural')) return [];
  const allowed = new Set(
    new Intl.PluralRules(locale).resolvedOptions().pluralCategories,
  );
  const invalid = [];
  const pluralRe = /\{\s*\w+\s*,\s*plural\s*,([^]*?)\}\s*\}/g;
  let m;
  while ((m = pluralRe.exec(message)) !== null) {
    const selectorRe = /(?:^|\})\s*(=?\w+)\s*\{/g;
    let s;
    while ((s = selectorRe.exec(m[1])) !== null) {
      const cat = s[1];
      if (!cat.startsWith('=') && !allowed.has(cat)) invalid.push(cat);
    }
  }
  return invalid;
}

function getPath(obj, dotted) {
  return dotted
    .split('.')
    .reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

module.exports = { flattenKeys, reviewCoverage, invalidPluralCategories };

if (require.main === module) {
  const localeFiles = fs
    .readdirSync(messagesDir)
    .filter((f) => f.endsWith('.json'));

  const keysByLocale = {};
  const contentByLocale = {};
  for (const file of localeFiles) {
    const locale = path.basename(file, '.json');
    const content = JSON.parse(
      fs.readFileSync(path.join(messagesDir, file), 'utf8'),
    );
    contentByLocale[locale] = content;
    keysByLocale[locale] = new Set(flattenKeys(content));
  }

  // Review coverage + plural sanity report — informational, never fails.
  const reviewStatusPath = path.join(
    __dirname,
    '..',
    'i18n',
    'review-status.json',
  );
  const reviewStatus = fs.existsSync(reviewStatusPath)
    ? JSON.parse(fs.readFileSync(reviewStatusPath, 'utf8'))
    : {};
  const report = [
    '### Translation review coverage',
    '',
    '| Locale | Reviewed | Total | Coverage |',
    '| --- | --- | --- | --- |',
  ];
  for (const locale of Object.keys(keysByLocale).sort()) {
    if (locale === 'en') continue; // source locale
    const keys = [...keysByLocale[locale]];
    const { reviewed, total, percent } = reviewCoverage(
      keys,
      reviewStatus[locale],
    );
    report.push(
      `| ${locale} | ${reviewed} | ${total} | ${percent.toFixed(1)}% |`,
    );
    for (const key of keys) {
      const bad = invalidPluralCategories(
        getPath(contentByLocale[locale], key),
        locale,
      );
      if (bad.length > 0) {
        console.warn(
          `Warning: "${key}" in ${locale} uses plural categories not used by ${locale}: ${bad.join(', ')}`,
        );
      }
    }
  }
  console.log(report.join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      report.join('\n') + '\n',
    );
  }

  const allKeys = new Set(
    Object.values(keysByLocale).flatMap((set) => [...set]),
  );

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

  if (hasMismatch) {
    console.error(
      '\nLocale key check failed: some keys are missing translations.',
    );
    process.exit(1);
  }

  console.log(
    `Locale key check passed for: ${Object.keys(keysByLocale).join(', ')}`,
  );
}
