#!/usr/bin/env node
// scripts/check-unicode.mjs
//
// Failure mode this guards against: the round-5 PlayerVitalsCard.tsx
// bug. When the write_file tool serialized JSON Unicode-escape
// sequences in our content parameter, it emitted the literal six-char
// sequence `\uXXXX` (backslash + u + 4 hex digits) instead of the
// actual UTF-8 byte. In a JS string / template literal / regex literal
// / `//` comment, JS still parses the escape at load time so behavior
// was unaffected \u2014 but in JSX text content the literal sequence
// surfaced as `\u00b7` text in the player UI. Repeatedly we've had to
// run a Python byte-level rewrite after write_file to clean this up.
//
// This script:
//   - Reads each file path given on the command line, OR scans the
//     default repo source dirs (components, __tests__, messages, app,
//     hooks, lib) when no args are given.
//   - Reports every literal `\u[0-9a-fA-F]{4}` occurrence with the
//     file:line:column and the offending 6-char sequence.
//   - Exits non-zero if any matches are found, so it can act as both a
//     pre-commit gate (via lint-staged or .husky/pre-commit) and a CI
//     gate (via `npm run check:unicode`).
//
// Scope note: this script intentionally matches only the literal
// six-character escape sequence (backslash + u + lowercase-or-uppercase
// hex digit x4), NOT the actual UTF-8 byte it would represent. We are
// detecting the *string* the broken tool emitted, not the *sequence*
// the AST would resolve to. So files containing real UTF-8 middle-dots
// / em-dashes / curly apostrophes that were originally written
// without `\uXXXX` escapes pass through cleanly.
//
// Run modes:
//   $ node scripts/check-unicode.mjs                 # scan default dirs
//   $ node scripts/check-unicode.mjs path/a.ts path/b.tsx   # explicit files

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const LITERAL_PATTERN = /\\u([0-9a-fA-F]{4})/g;

// Default dirs to scan when no file args are given.
const DEFAULT_DIRS = [
  'components',
  '__tests__',
  'messages',
  'app',
  'hooks',
  'lib',
];

const ROOT = process.cwd();

/**
 * Walk a directory recursively, yielding absolute file paths of regular
 * files whose name matches the given set of extensions. The walk
 * skips node_modules, .next, coverage, .git, public/sw artifacts to
 * stay focused on hand-written source.
 */
function* walk(dir, exts) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // missing dir (e.g. no __tests__ yet) \u2014 skip silently
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' ||
        entry.name === '.git'  || entry.name === 'coverage') {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full, exts);
    } else if (entry.isFile()) {
      if (exts.some((ext) => entry.name.endsWith(ext))) {
        yield full;
      }
    }
  }
}

/**
 * Run the literal-escape check against one file. Returns an array of
 * { file, line, column, match } objects describing each occurrence;
 * empty array means the file is clean.
 */
function checkFile(absPath) {
  let content;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch {
    return [];
  }
  const findings = [];
  let m;
  // No /g state because we re-anchor each search; here we want the
  // sticky flag so multi-line content isn't missed.
  const re = new RegExp(LITERAL_PATTERN.source, 'g');
  while ((m = re.exec(content)) !== null) {
    const upTo = content.slice(0, m.index);
    const line = upTo.split('\n').length;
    const lastNl = upTo.lastIndexOf('\n');
    const column = m.index - (lastNl === -1 ? 0 : lastNl + 1);
    findings.push({
      file: relative(ROOT, absPath),
      line,
      column,
      match: m[0],
    });
  }
  return findings;
}

const args = process.argv.slice(2);
let allFindings = [];

if (args.length > 0) {
  // Explicit-file mode (lint-staged one-file-at-a-time calls land here)
  for (const arg of args) {
    allFindings.push(...checkFile(join(ROOT, arg)));
  }
} else {
  // Whole-tree mode (`npm run check:unicode`)
  for (const dir of DEFAULT_DIRS) {
    const full = join(ROOT, dir);
    try {
      statSync(full);
    } catch {
      continue;
    }
    for (const file of walk(full, ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.mdx', '.css'])) {
      allFindings.push(...checkFile(file));
    }
  }
}

if (allFindings.length > 0) {
  console.error('');
  console.error(
    `\u26a0  Found ${allFindings.length} literal \\uXXXX escape sequence(s). ` +
    `These were introduced by the write_file JSON-escape hand-off and ` +
    `MUST be replaced with actual UTF-8 bytes before commit.`,
  );
  console.error('');
  console.error('Affected file:line:column  match');
  for (const f of allFindings) {
    console.error(`  ${f.file}:${f.line}:${f.column}  ${f.match}`);
  }
  console.error('');
  console.error(
    'Fix: replace each literal `\\u00b7` (or whatever escape) in the source ' +
    'with the actual byte (e.g. `\\u00b7` \u2192 `\u00b7`). If the file was just `write_file`-d, re-emit ' +
    'with the byte inline (e.g. "\\u00b7" in the JSON content), or run the ' +
    'Python byte-level rewrite used in the audit-sweep commit (43114fa).',
  );
  process.exit(1);
}

process.exit(0);
