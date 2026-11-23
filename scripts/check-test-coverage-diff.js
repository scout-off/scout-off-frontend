#!/usr/bin/env node
/**
 * PR-diff-scoped guard: flags any new/changed file under hooks/, lib/, or
 * components/ that has no matching test under __tests__/.
 *
 * Deliberately scoped to the diff (added/modified files vs. the PR's base
 * branch), NOT a full-repo scan — a full-repo scan would immediately fail
 * on this repo's existing pre-batch gaps instead of acting as a
 * forward-looking guard on new work.
 *
 * Usage:
 *   node scripts/check-test-coverage-diff.js [baseRef]
 *
 * baseRef defaults to $BASE_REF, then 'origin/main'. Compares
 * `<baseRef>...HEAD` (merge-base diff, matching a PR's actual change set).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const WATCHED_DIRS = ['hooks/', 'lib/', 'components/'];

// Files matching any of these are exempt from needing a dedicated test.
// Keep this list deliberate and documented — don't add to it just because
// a file is small (see issue #1167 / #1012 re: lib/positions.ts,
// lib/regions.ts, which are pure data but still worth testing for drift).
const EXEMPT_PATTERNS = [
  /\.stories\.tsx?$/, // Storybook stories are covered by check-storybook-coverage.js instead
  /(^|\/)index\.tsx?$/, // barrel re-export files, no logic of their own
  /\.d\.ts$/, // ambient type declarations
  /(^|\/)types\.ts$/, // pure type-definition modules
  /\.types\.ts$/,
];

function getChangedFiles(baseRef) {
  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  return output.split('\n').filter(Boolean);
}

function isWatched(file) {
  return WATCHED_DIRS.some((dir) => file.startsWith(dir));
}

function isExempt(file) {
  return EXEMPT_PATTERNS.some((rx) => rx.test(file));
}

/** Recursively collect every file path under __tests__/, relative to repo root. */
function listTestFiles() {
  const testsDir = path.join(repoRoot, '__tests__');
  const results = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        results.push(path.relative(repoRoot, full));
      }
    }
  }

  if (fs.existsSync(testsDir)) walk(testsDir);
  return results;
}

/** A source file `foo/Bar.tsx` is considered covered if __tests__/ contains
 * any file whose name starts with `Bar.` and includes a `.test.` or
 * `.spec.` segment (e.g. Bar.test.tsx, Bar.a11y.test.tsx, Bar.spec.ts). */
function findMissingTests(changedFiles, testFiles) {
  const testBaseNames = testFiles.map((f) => path.basename(f));

  return changedFiles.filter((file) => {
    const baseName = path.basename(file).replace(/\.[jt]sx?$/, '');
    const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Matches Bar.test.tsx as well as Bar.a11y.test.tsx (an optional
    // qualifier segment before .test./.spec.).
    const rx = new RegExp(`^${escaped}\\.(\\w+\\.)?(test|spec)\\.`);
    return !testBaseNames.some((t) => rx.test(t));
  });
}

function main() {
  const baseRef = process.argv[2] || process.env.BASE_REF || 'origin/main';

  const changed = getChangedFiles(baseRef)
    .filter(isWatched)
    .filter((f) => !isExempt(f));

  const testFiles = listTestFiles();
  const missing = findMissingTests(changed, testFiles);

  if (missing.length === 0) {
    console.log(
      `Test coverage check passed: all changed hooks/, lib/, components/ files (vs. ${baseRef}) have a matching test.`,
    );
    return;
  }

  console.error(
    'The following changed files have no matching test under __tests__/:\n' +
      missing.map((f) => `  - ${f}`).join('\n') +
      '\n\nAdd a __tests__/ file covering the new/changed behaviour, or add it to ' +
      'EXEMPT_PATTERNS in scripts/check-test-coverage-diff.js with a reason if it ' +
      'genuinely needs no test (e.g. a barrel/index file or pure type module).',
  );
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  getChangedFiles,
  isWatched,
  isExempt,
  findMissingTests,
  EXEMPT_PATTERNS,
  WATCHED_DIRS,
};
