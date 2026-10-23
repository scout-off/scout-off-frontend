/**
 * Unit tests for scripts/check-locale-keys.js
 *
 * Exercises flattenKeys in isolation and the overall mismatch-detection logic
 * against small fixture objects, so CI failure paths can be asserted without
 * touching the real messages/*.json files.
 *
 * The script's CLI entry-point is guarded by `require.main === module`, so
 * requiring the module here only exposes the exported function without
 * triggering any filesystem reads or process.exit calls.
 */

const {
  flattenKeys,
  flattenValues,
  extractPlaceholders,
} = require('../../scripts/check-locale-keys');

// ── Helper: run the comparison logic extracted from the script ────────────────
// Mirrors the keysByLocale / allKeys / hasMismatch block from the CLI entry
// point so we can test mismatch detection without importing side-effecting code.

/**
 * Given a plain object whose values are locale JSON objects, returns the array
 * of console.error strings that the script would print (without calling
 * process.exit). An empty array means all locales are in sync.
 *
 * @param {Record<string, Record<string, unknown>>} locales
 * @returns {string[]} Error messages for any mismatched keys.
 */
function detectMismatches(locales) {
  const keysByLocale = {};
  for (const [locale, content] of Object.entries(locales)) {
    keysByLocale[locale] = new Set(flattenKeys(content));
  }

  const allKeys = new Set(
    Object.values(keysByLocale).flatMap((set) => [...set]),
  );

  const errors = [];
  for (const key of allKeys) {
    const missingIn = Object.entries(keysByLocale)
      .filter(([, keys]) => !keys.has(key))
      .map(([locale]) => locale);

    if (missingIn.length > 0) {
      errors.push(`Missing key "${key}" in locale(s): ${missingIn.join(', ')}`);
    }
  }
  return errors;
}

// ── flattenKeys ───────────────────────────────────────────────────────────────

describe('flattenKeys', () => {
  it('returns a single key for a flat object', () => {
    const result = flattenKeys({ title: 'ScoutOff' });
    expect(result).toEqual(['title']);
  });

  it('joins nested keys with dots', () => {
    const result = flattenKeys({ nav: { home: 'Home', about: 'About' } });
    expect(result).toEqual(['nav.home', 'nav.about']);
  });

  it('flattens deeply nested objects', () => {
    const result = flattenKeys({
      a: { b: { c: 'deep' } },
    });
    expect(result).toEqual(['a.b.c']);
  });

  it('handles mixed shallow and deep keys in the same object', () => {
    const result = flattenKeys({
      title: 'App',
      nav: { home: 'Home' },
      footer: { links: { privacy: 'Privacy', terms: 'Terms' } },
    });
    expect(result).toEqual([
      'title',
      'nav.home',
      'footer.links.privacy',
      'footer.links.terms',
    ]);
  });

  it('treats array-valued leaves as leaf nodes and does NOT recurse into them', () => {
    // Arrays should produce a single path entry — the array itself is the
    // "value", not its elements, so ["a", "b"] is not recursed into.
    const result = flattenKeys({ items: ['a', 'b', 'c'] });
    expect(result).toEqual(['items']);
  });

  it('does not recurse into arrays even when they contain objects', () => {
    const result = flattenKeys({
      list: [{ key: 'value' }, { key: 'other' }],
    });
    // The whole array is a leaf — its inner object keys are not walked.
    expect(result).toEqual(['list']);
  });

  it('treats null as a leaf (does not throw or recurse)', () => {
    // null passes `typeof value === 'object'` but fails the truthiness check,
    // so it should be emitted as a leaf path.
    const result = flattenKeys({ missing: null });
    expect(result).toEqual(['missing']);
  });

  it('treats numeric values as leaf nodes', () => {
    const result = flattenKeys({ count: 42 });
    expect(result).toEqual(['count']);
  });

  it('treats boolean values as leaf nodes', () => {
    const result = flattenKeys({ enabled: true });
    expect(result).toEqual(['enabled']);
  });

  it('returns an empty array for an empty object', () => {
    expect(flattenKeys({})).toEqual([]);
  });

  it('uses the prefix argument to prepend a parent key path', () => {
    // The prefix parameter is used during recursion — calling it directly
    // with a prefix mirrors how the recursive call works internally.
    const result = flattenKeys({ home: 'Home' }, 'nav');
    expect(result).toEqual(['nav.home']);
  });
});

// ── Mismatch detection ────────────────────────────────────────────────────────

describe('mismatch detection', () => {
  it('reports no errors when all locales have identical key sets', () => {
    const locales = {
      en: { title: 'ScoutOff', nav: { home: 'Home' } },
      fr: { title: 'ScoutOff FR', nav: { home: 'Accueil' } },
      sw: { title: 'ScoutOff SW', nav: { home: 'Nyumbani' } },
    };
    expect(detectMismatches(locales)).toEqual([]);
  });

  it('reports a missing top-level key when one locale is missing it', () => {
    const locales = {
      en: { title: 'ScoutOff', footer: 'Footer text' },
      fr: { title: 'ScoutOff FR' }, // missing 'footer'
    };
    const errors = detectMismatches(locales);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"footer"');
    expect(errors[0]).toContain('fr');
  });

  it('reports a missing nested key when one locale lacks a deeper path', () => {
    const locales = {
      en: { nav: { home: 'Home', about: 'About' } },
      fr: { nav: { home: 'Accueil' } }, // missing 'nav.about'
    };
    const errors = detectMismatches(locales);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"nav.about"');
    expect(errors[0]).toContain('fr');
  });

  it('reports multiple missing keys across multiple locales independently', () => {
    const locales = {
      en: { a: '1', b: '2', c: '3' },
      fr: { a: '1' }, // missing b, c
      sw: { a: '1', b: '2' }, // missing c
    };
    const errors = detectMismatches(locales);
    // Should have an error for 'b' (missing in fr) and 'c' (missing in fr + sw).
    expect(errors.length).toBeGreaterThanOrEqual(2);

    const bError = errors.find((e) => e.includes('"b"'));
    expect(bError).toBeDefined();
    expect(bError).toContain('fr');

    const cError = errors.find((e) => e.includes('"c"'));
    expect(cError).toBeDefined();
    expect(cError).toMatch(/fr|sw/);
  });

  it('does not report an error for array-valued keys when all locales have the same array key', () => {
    // Arrays are leaf nodes — as long as all locales define the key, no
    // mismatch is reported regardless of the array's contents.
    const locales = {
      en: { items: ['one', 'two'] },
      fr: { items: ['un', 'deux'] },
    };
    expect(detectMismatches(locales)).toEqual([]);
  });

  it('reports an error when an array-valued key is missing from one locale', () => {
    const locales = {
      en: { title: 'App', items: ['a', 'b'] },
      fr: { title: 'App FR' }, // missing 'items' entirely
    };
    const errors = detectMismatches(locales);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"items"');
    expect(errors[0]).toContain('fr');
  });

  it('passes with a single locale (nothing to compare against)', () => {
    // A single locale can never have a mismatch with itself.
    const locales = { en: { title: 'ScoutOff' } };
    expect(detectMismatches(locales)).toEqual([]);
  });

  it('handles deeply nested missing keys', () => {
    const locales = {
      en: { errors: { network: { timeout: 'Timed out' } } },
      fr: { errors: { network: {} } }, // missing errors.network.timeout
    };
    const errors = detectMismatches(locales);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"errors.network.timeout"');
    expect(errors[0]).toContain('fr');
  });
});

// ── extractPlaceholders (issue #1503) ─────────────────────────────────────────
// A regex that matches every `{word}` would treat plural-clause wording like
// `one {time} other {times}` as placeholder names and produce false mismatches
// between locales that translate those words. The parser must only report
// top-level argument names and skip the body of typed (plural/select/number)
// arguments.

describe('extractPlaceholders', () => {
  it('returns an empty set for a plain string with no arguments', () => {
    expect([...extractPlaceholders('Hello world')]).toEqual([]);
  });

  it('extracts a simple {name} argument', () => {
    expect([...extractPlaceholders('Hello {name}')]).toEqual(['name']);
  });

  it('extracts multiple simple arguments', () => {
    expect(
      [...extractPlaceholders('{greeting}, {name}! You have {n} messages.')].sort(),
    ).toEqual(['greeting', 'n', 'name']);
  });

  it('returns an empty set for non-string values', () => {
    expect([...extractPlaceholders(42)]).toEqual([]);
    expect([...extractPlaceholders(true)]).toEqual([]);
    expect([...extractPlaceholders(null)]).toEqual([]);
    expect([...extractPlaceholders(['a', 'b'])]).toEqual([]);
    expect([...extractPlaceholders(undefined)]).toEqual([]);
  });

  it('does NOT treat the # plural offset as a placeholder', () => {
    // `#` inside a plural clause is the count, not an argument name.
    const ph = extractPlaceholders(
      '{count, plural, one {# item} other {# items}}',
    );
    expect([...ph]).toEqual(['count']);
  });

  it('does NOT capture literal text inside plural clauses as placeholders', () => {
    // Regression guard for the exact false positive that motivated this
    // rewrite: en says `one {time} other {times}`, fr says `one {fois} other
    // {fois}` — `time`/`times`/`fois` are wording, not arguments. Both must
    // resolve to the single argument `retryCount`.
    const en = extractPlaceholders(
      '{type} action (attempted {retryCount} {retryCount, plural, one {time} other {times}})',
    );
    const fr = extractPlaceholders(
      'Action {type} (tentée {retryCount} {retryCount, plural, one {fois} other {fois}})',
    );
    expect([...en].sort()).toEqual(['retryCount', 'type']);
    expect([...fr].sort()).toEqual(['retryCount', 'type']);
    expect(en).toEqual(fr);
  });

  it('skips the body of a select argument but records its name', () => {
    const ph = extractPlaceholders(
      '{gender, select, male {He} female {She} other {They}} responded.',
    );
    expect([...ph]).toEqual(['gender']);
  });

  it('skips the body of a number/date argument', () => {
    const ph = extractPlaceholders('Total: {amount, number} on {date, date}');
    expect([...ph].sort()).toEqual(['amount', 'date']);
  });

  it('skips the body of a plural clause (nested {arg} refs are not captured)', () => {
    // The parser skips plural/select clause bodies wholesale, so a nested
    // `{arg}` reference inside a plural clause is NOT reported. This is a
    // deliberate trade-off: the real locale files use `#` for the count and
    // translated wording (e.g. `one {time} other {times}`) — capturing those
    // `{word}` patterns as placeholders would false-positive across locales.
    // The top-level argument `count` is still captured.
    const ph = extractPlaceholders(
      '{count, plural, one {{name} has 1 item} other {{name} has # items}}',
    );
    expect([...ph]).toEqual(['count']);
  });

  it('handles rich-text <tags> as plain text (no false placeholders)', () => {
    // next-intl rich-text tags look like HTML and contain no {arg}, so they
    // should produce no placeholders. The dispute modal uses <highlight>.
    const ph = extractPlaceholders(
      'Flag <highlight>{milestone}</highlight> for review.',
    );
    expect([...ph]).toEqual(['milestone']);
  });

  it('returns an empty set for an empty string', () => {
    expect([...extractPlaceholders('')]).toEqual([]);
  });

  it('does not loop forever on an unbalanced opening brace', () => {
    // Malformed input must not hang the parser.
    expect([...extractPlaceholders('Hello {name')]).toEqual([]);
  });

  it('ignores braces that are not arguments (e.g. {{escaped}})', () => {
    // Doubled braces are literal `{`/`}` in ICU; they are not arguments.
    // The parser should not crash and should not report a placeholder.
    expect([...extractPlaceholders('Use {{literal}} braces')]).toEqual([]);
  });
});

// ── Placeholder mismatch detection (issue #1503) ──────────────────────────────

/**
 * Mirrors the placeholder-mismatch block from the script's CLI entry point so
 * we can assert it without running process.exit. Returns the list of error
 * strings the script would print.
 *
 * @param {Record<string, Record<string, unknown>>} locales
 * @returns {string[]} Error messages for any placeholder mismatches.
 */
function detectPlaceholderMismatches(locales) {
  const valuesByLocale = {};
  for (const [locale, content] of Object.entries(locales)) {
    valuesByLocale[locale] = flattenValues(content);
  }
  const allKeys = new Set(
    Object.values(valuesByLocale).flatMap((v) => Object.keys(v)),
  );
  const errors = [];
  for (const key of allKeys) {
    const perLocale = Object.fromEntries(
      Object.entries(valuesByLocale).map(([locale, values]) => [
        locale,
        extractPlaceholders(values[key]),
      ]),
    );
    const presentLocales = Object.keys(perLocale);
    for (let i = 0; i < presentLocales.length; i += 1) {
      for (let j = i + 1; j < presentLocales.length; j += 1) {
        const a = presentLocales[i];
        const b = presentLocales[j];
        const setA = perLocale[a];
        const setB = perLocale[b];
        const missingInB = [...setA].filter((p) => !setB.has(p));
        const missingInA = [...setB].filter((p) => !setA.has(p));
        if (missingInB.length || missingInA.length) {
          const detail = [
            missingInB.length &&
              `${a} has {${missingInB.join('}, {')}} missing in ${b}`,
            missingInA.length &&
              `${b} has {${missingInA.join('}, {')}} missing in ${a}`,
          ]
            .filter(Boolean)
            .join('; ');
          errors.push(
            `Placeholder mismatch for key "${key}": ${detail}`,
          );
        }
      }
    }
  }
  return errors;
}

describe('placeholder mismatch detection', () => {
  it('reports no errors when all locales use the same placeholders', () => {
    const locales = {
      en: { greet: 'Hello {name}, {count} unread' },
      fr: { greet: 'Bonjour {name}, {count} non lus' },
      sw: { greet: 'Habari {name}, {count} hazijasomwa' },
    };
    expect(detectPlaceholderMismatches(locales)).toEqual([]);
  });

  it('reports an error when a locale is missing a placeholder', () => {
    const locales = {
      en: { greet: 'Hello {name}, {count} unread' },
      fr: { greet: 'Bonjour {name}' }, // missing {count}
    };
    const errors = detectPlaceholderMismatches(locales);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"greet"');
    expect(errors[0]).toContain('count');
  });

  it('reports an error when a locale has an extra placeholder', () => {
    const locales = {
      en: { greet: 'Hello {name}' },
      fr: { greet: 'Bonjour {name}, {extra}' }, // extra {extra}
    };
    const errors = detectPlaceholderMismatches(locales);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"greet"');
    expect(errors[0]).toContain('extra');
  });

  it('does NOT report a mismatch for translated plural-clause wording', () => {
    // This is the regression guard for the original false positive: en uses
    // `time`/`times` and fr uses `fois` inside the plural clause. The real
    // argument is `retryCount` in both — no mismatch.
    const locales = {
      en: {
        label: '{type} action (attempted {retryCount} {retryCount, plural, one {time} other {times}})',
      },
      fr: {
        label: 'Action {type} (tentée {retryCount} {retryCount, plural, one {fois} other {fois}})',
      },
    };
    expect(detectPlaceholderMismatches(locales)).toEqual([]);
  });

  it('does NOT flag rich-text tag content as a mismatch', () => {
    const locales = {
      en: { intro: 'Flag <highlight>{milestone}</highlight> for review' },
      fr: { intro: 'Signaler <highlight>{milestone}</highlight> pour révision' },
    };
    expect(detectPlaceholderMismatches(locales)).toEqual([]);
  });

  it('passes with a single locale', () => {
    const locales = { en: { greet: 'Hello {name}' } };
    expect(detectPlaceholderMismatches(locales)).toEqual([]);
  });
});
