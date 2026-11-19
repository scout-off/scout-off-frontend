#!/usr/bin/env node
/**
 * Drafts a new content/changelog.md entry from Conventional Commits since the
 * last release tag (or, with no tags, since the newest entry's date).
 *
 *   node scripts/draft-changelog.js [--dry-run] [--title "Release title"]
 *                                   [--date YYYY-MM-DD] [--since <ref>]
 *
 * feat → Added, perf/refactor → Improved, fix → Fixed. Other types
 * (chore, ci, test, docs, build, style, revert) and dependency bumps are
 * skipped. The output is a draft: a maintainer must edit it to be
 * user-facing before publishing.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SECTION_BY_TYPE = {
  feat: 'Added',
  perf: 'Improved',
  refactor: 'Improved',
  fix: 'Fixed',
};
const SECTION_ORDER = ['Added', 'Improved', 'Fixed'];
const HEADER_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;
const DEP_BUMP_RE = /^(bump|update|upgrade)\s+\S+\s+from\s+\S+\s+to\s+\S+/i;

/** Strips issue/PR refs like "(#123)", "Closes #12", trailing "#45". */
function cleanSubject(subject) {
  const text = subject
    .replace(/\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s*:?\s*#\d+/gi, '')
    .replace(/\(\s*#\d+\s*\)/g, '')
    .replace(/#\d+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;:-]+$/, '')
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Returns { section, text } for a user-facing commit subject, else null. */
function categorizeCommit(subject) {
  const match = HEADER_RE.exec(subject.trim());
  if (!match) return null;
  const [, rawType, scope = '', , description] = match;
  const section = SECTION_BY_TYPE[rawType.toLowerCase()];
  if (!section) return null;
  if (/^deps(-dev)?$/i.test(scope) || DEP_BUMP_RE.test(description)) {
    return null;
  }
  const text = cleanSubject(description);
  return text ? { section, text } : null;
}

/** Builds a markdown entry in the format lib/changelog.ts parses. */
function buildEntry(subjects, { title, date }) {
  const sections = { Added: [], Improved: [], Fixed: [] };
  for (const subject of subjects) {
    const result = categorizeCommit(subject);
    if (result && !sections[result.section].includes(result.text)) {
      sections[result.section].push(result.text);
    }
  }
  const body = SECTION_ORDER.filter((name) => sections[name].length > 0).map(
    (name) =>
      `### ${name}\n\n${sections[name].map((item) => `- ${item}`).join('\n')}`,
  );
  if (body.length === 0) return null;
  return `## ${title} - ${date}\n\n${body.join('\n\n')}\n`;
}

/** Inserts the entry above the first existing `## ` entry. */
function insertEntry(markdown, entry) {
  const index = markdown.search(/^## /m);
  if (index === -1) return `${markdown.trimEnd()}\n\n${entry}`;
  return `${markdown.slice(0, index)}${entry}\n${markdown.slice(index)}`;
}

function latestEntryDate(markdown) {
  const match = /^##\s+.+?\s+-\s+(\d{4}-\d{2}-\d{2})\s*$/m.exec(markdown);
  return match ? match[1] : null;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function parseArgs(argv) {
  const opts = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--title') opts.title = argv[++i];
    else if (arg === '--date') opts.date = argv[++i];
    else if (arg === '--since') opts.since = argv[++i];
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const changelogPath = path.join(process.cwd(), 'content', 'changelog.md');
  const markdown = fs.readFileSync(changelogPath, 'utf8');

  const range = ['log', '--no-merges', '--format=%s'];
  let since = opts.since;
  if (!since) {
    try {
      since = git(['describe', '--tags', '--abbrev=0']);
    } catch {
      since = null;
    }
  }
  if (since) range.push(`${since}..HEAD`);
  else {
    const lastDate = latestEntryDate(markdown);
    if (lastDate) range.push(`--since=${lastDate}`);
  }

  const subjects = git(range).split('\n').filter(Boolean);
  const date = opts.date || new Date().toISOString().slice(0, 10);
  const entry = buildEntry(subjects, {
    title: opts.title || `Release ${date}`,
    date,
  });

  if (!entry) {
    console.log('No user-facing commits found; changelog unchanged.');
    return;
  }
  if (opts.dryRun) {
    process.stdout.write(entry);
    return;
  }
  fs.writeFileSync(changelogPath, insertEntry(markdown, entry));
  console.log(
    'Drafted a new entry in content/changelog.md. Edit it before publishing.',
  );
}

if (require.main === module) main();

module.exports = {
  categorizeCommit,
  cleanSubject,
  buildEntry,
  insertEntry,
  latestEntryDate,
};
