#!/usr/bin/env node
/**
 * Compares keys across all messages/*.json locale files and fails if any
 * key present in one locale is missing from another, to catch untranslated
 * strings before merge.
 */
const fs = require('fs');
const path = require('path');

const messagesDir = path.join(__dirname, '..', 'messages');

function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value, fullKey);
    }
    return [fullKey];
  });
}

const localeFiles = fs
  .readdirSync(messagesDir)
  .filter((f) => f.endsWith('.json'));

const keysByLocale = {};
for (const file of localeFiles) {
  const locale = path.basename(file, '.json');
  const content = JSON.parse(
    fs.readFileSync(path.join(messagesDir, file), 'utf8'),
  );
  keysByLocale[locale] = new Set(flattenKeys(content));
}

const allKeys = new Set(Object.values(keysByLocale).flatMap((set) => [...set]));

let hasMismatch = false;
for (const key of allKeys) {
  const missingIn = Object.entries(keysByLocale)
    .filter(([, keys]) => !keys.has(key))
    .map(([locale]) => locale);

  if (missingIn.length > 0) {
    hasMismatch = true;
    console.error(`Missing key "${key}" in locale(s): ${missingIn.join(', ')}`);
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
