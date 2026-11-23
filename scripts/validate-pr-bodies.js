#!/usr/bin/env node
/**
 * Canonical contract guard for `docs/pr-bodies/`. Invoked from CI
 * (`.github/workflows/ci.yml`, `lint` job, "Validate docs/pr-bodies/
 * body-file contract" step) AND runnable locally for fast feedback:
 *
 *   node scripts/validate-pr-bodies.js
 *
 * Exit code 0 if every body file in `docs/pr-bodies/` (other than README.md)
 * satisfies the contract: required HTML comment headers at the top, required
 * `## Summary` + `## Validation` sections, and the `<!-- Branch: ... -->`
 * header matches the branch name derived from the filename
 * (e.g. `chore-lint-followups.md` -> `chore/lint-followups`).
 *
 * If you change the rules here, also update:
 *   - `docs/pr-bodies/README.md` (the contract documentation)
 *   - `.github/PULL_REQUEST_TEMPLATE.md` (author-facing summary of the contract)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const dir = 'docs/pr-bodies';
const SKIP = new Set(['README.md']);
const REQ_HEADERS = [
  // Branch names are single tokens (no spaces) so [^\s]+ is right.
  [/<!-- Branch: [^\s]+ -->/, '<!-- Branch: ... -->'],
  // Titles are full commit subjects and DO contain spaces, so
  // match anything up to the closing `-->`. `[^>]+` rejects
  // nested `>` while still allowing parens, brackets, slashes, etc.
  [/<!-- Title: [^>]+ -->/, '<!-- Title: ... -->'],
];
const REQ_SECTIONS = [
  [/^## Summary/m, '## Summary'],
  [/^## Validation/m, '## Validation'],
];

let bad = [];
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.md') && !SKIP.has(f));

for (const f of files) {
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const [rx, label] of REQ_HEADERS) {
    if (!rx.test(content)) bad.push(`${f}: missing ${label} header`);
  }
  for (const [rx, label] of REQ_SECTIONS) {
    if (!rx.test(content)) bad.push(`${f}: missing ${label} section`);
  }

  // Branch name is derived from the filename convention
  // (e.g. `chore-lint-followups.md` -> `chore/lint-followups`).
  // Self-consistent check: verify the `<!-- Branch: ... -->`
  // header matches the filename-derived name, without asking
  // git — CI only checks out the PR's branch.
  const branchFromName = f.replace(/\.md$/, '').replace(/-/, '/');
  const headerMatch = content.match(/<!-- Branch: ([^\s]+) -->/);
  if (!headerMatch) {
    bad.push(`${f}: <!-- Branch: ... --> header missing (defensive)`);
  } else if (headerMatch[1] !== branchFromName) {
    bad.push(
      `${f}: <!-- Branch: ${headerMatch[1]} --> does not match filename-derived branch '${branchFromName}'`,
    );
  }
}

if (bad.length) {
  console.error('docs/pr-bodies/ contract violations:');
  bad.forEach((b) => console.error('  - ' + b));
  process.exit(1);
}

console.log(
  `All ${files.length} body file(s) in docs/pr-bodies/ pass the contract.`,
);
