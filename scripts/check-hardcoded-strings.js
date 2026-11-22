#!/usr/bin/env node
/**
 * Flags hard-coded user-facing English in TSX (issue #1697):
 *  - literal JSX text, e.g. `<h1>Scout Dashboard</h1>`
 *  - literal `placeholder`, `aria-label`, `title` and `alt` attributes
 *
 * Scope: app/ and components/, excluding stories, tests and app/api/.
 * Runs in warning mode by default (exit 0) and prints a violation count,
 * which is also appended to $GITHUB_STEP_SUMMARY in CI. Pass `--strict` to
 * exit 1 once the per-component i18n issues are done.
 *
 * Usage: node scripts/check-hardcoded-strings.js [--strict] [paths...]
 * To allow a legitimate literal, add `// i18n-ignore` on the same line.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const targets = args.filter((a) => !a.startsWith('--'));
const roots = targets.length ? targets : ['app', 'components'];

const EXCLUDE = [
  /\.stories\.tsx$/,
  /\.test\.tsx$/,
  /(^|\/)__tests__\//,
  /^app\/api\//,
];
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const ATTR_RE = new RegExp(
  `\\b(${ATTRS.join('|')})="([^"{}]*[A-Za-z][^"{}]*)"`,
  'g',
);
// Text between a JSX tag close `>` and the next `<` or `{` that contains a
// word of at least two letters.
// The `>` must not be part of an arrow function (`=>`).
const TEXT_RE = /(?<![=-])>([^<>{}`]*[A-Za-z]{2,}[^<>{}`]*)[<{]/g;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    if (dir.endsWith('.tsx')) out.push(dir);
    return out;
  }
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    walk(path.join(dir, entry), out);
  }
  return out;
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function scanFile(abs) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  if (EXCLUDE.some((re) => re.test(rel))) return [];
  const src = fs.readFileSync(abs, 'utf8');
  const lines = src.split('\n');
  const found = [];
  const push = (index, kind, text) => {
    const line = lineOf(src, index);
    if (/i18n-ignore/.test(lines[line - 1] || '')) return;
    found.push({
      file: rel,
      line,
      kind,
      text: text.trim().replace(/\s+/g, ' '),
    });
  };

  for (const m of src.matchAll(ATTR_RE)) push(m.index, m[1], m[2]);
  for (const m of src.matchAll(TEXT_RE)) {
    const text = m[1];
    // Skip code that looks like text: comparisons (`a > b < c`), function
    // calls, ternaries continuing after a closing tag, and comments.
    if (
      /[;=&|]|=>|\)\s*$/.test(text) ||
      /^\s*\/\//.test(text) ||
      /\w\(/.test(text) ||
      /^\s*[)\]]/.test(text) ||
      /\?\s*\(?\s*$/.test(text)
    ) {
      continue;
    }
    if (!text.trim()) continue;
    push(m.index + 1, 'text', text);
  }
  return found;
}

const files = roots.flatMap((r) => walk(path.join(ROOT, r), []));
const violations = files.flatMap(scanFile);

for (const v of violations) {
  console.warn(`⚠ ${v.file}:${v.line} [${v.kind}] ${JSON.stringify(v.text)}`);
}

const byFile = {};
for (const v of violations) byFile[v.file] = (byFile[v.file] || 0) + 1;
const summary =
  `Hard-coded user-facing strings: ${violations.length} in ` +
  `${Object.keys(byFile).length} file(s)` +
  (strict ? '' : ' (warning mode)');
console.log(`\n${summary}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = Object.entries(byFile)
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => `| \`${f}\` | ${n} |`)
    .join('\n');
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### i18n\n\n${summary}\n\n| File | Count |\n| --- | --- |\n${rows}\n`,
  );
}

if (strict && violations.length > 0) process.exit(1);
