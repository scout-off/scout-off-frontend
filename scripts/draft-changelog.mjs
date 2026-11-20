#!/usr/bin/env node
/**
 * Drafts a new `content/changelog.md` entry from conventional commits since
 * the last release tag (or, without tags, since the newest changelog entry's
 * date). feat → Added, perf/refactor → Improved, fix → Fixed; other types and
 * dependency bumps are skipped. The output is a draft for a maintainer to edit.
 *
 * Usage:
 *   node scripts/draft-changelog.mjs [--dry-run] [--title "Release title"] [--since <ref>]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildChangelogEntry,
  formatChangelogEntry,
  insertChangelogEntry,
  latestChangelogDate,
} from '../lib/changelog.ts';

const CHANGELOG_PATH = path.join(process.cwd(), 'content', 'changelog.md');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : undefined;
}

function lastTag() {
  try {
    return git(['describe', '--tags', '--abbrev=0']);
  } catch {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const date = new Date().toISOString().slice(0, 10);
  const title = argValue(args, '--title') ?? `Release ${date}`;
  const markdown = readFileSync(CHANGELOG_PATH, 'utf8');

  const since = argValue(args, '--since') ?? lastTag();
  const logArgs = ['log', '--no-merges', '--format=%s'];
  if (since) {
    logArgs.push(`${since}..HEAD`);
  } else {
    const lastDate = latestChangelogDate(markdown);
    if (lastDate) logArgs.push(`--since=${lastDate}`);
  }
  const subjects = git(logArgs).split('\n').filter(Boolean);

  const entry = buildChangelogEntry(subjects, title, date);
  if (!entry) {
    console.log('No user-facing commits found; changelog unchanged.');
    return;
  }

  const entryText = formatChangelogEntry(entry);
  if (dryRun) {
    process.stdout.write(entryText);
    return;
  }
  writeFileSync(CHANGELOG_PATH, insertChangelogEntry(markdown, entryText));
  console.log(
    `Drafted "${title}" in content/changelog.md — review and edit before publishing.`,
  );
}

main();
