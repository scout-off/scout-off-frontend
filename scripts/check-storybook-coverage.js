#!/usr/bin/env node
/**
 * Checks that every shared UI primitive under components/ui/ has a matching
 * Storybook story, so the story-coverage gap closed in issue #1166's batch
 * doesn't quietly reopen as new components/ui/ files are added.
 *
 * Scoped to components/ui/ only (not the whole components/ tree) — that's
 * the shared-primitive layer where a story is almost always appropriate;
 * page-level/data-dependent components elsewhere are not good candidates
 * and would just produce noisy failures.
 *
 * Non-blocking by design (see main() below): this prints missing stories as
 * a warning and exits 0, rather than failing the build. Flip WARN_ONLY to
 * false once components/ui/'s existing story-coverage gaps (tracked
 * alongside issue #1166) are fully closed and the team wants this to start
 * blocking merges.
 */
const fs = require('fs');
const path = require('path');

const uiDir = path.join(__dirname, '..', 'components', 'ui');

// Files under components/ui/ that are intentionally exempt from needing a
// story (e.g. not independently renderable, or pure re-exports). Empty
// today — add a filename here with a comment explaining why, rather than
// exempting anything just because it's small.
const EXEMPT = new Set([]);

const WARN_ONLY = true;

function findComponentsMissingStories() {
  const files = fs.readdirSync(uiDir);

  const components = files
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.stories.tsx'))
    .filter((f) => !EXEMPT.has(f));

  return components.filter((f) => {
    const storyFile = f.replace(/\.tsx$/, '.stories.tsx');
    return !files.includes(storyFile);
  });
}

function main() {
  const missing = findComponentsMissingStories();

  if (missing.length === 0) {
    console.log(
      'Storybook coverage check passed: components/ui/ is fully covered.',
    );
    return;
  }

  const label = WARN_ONLY ? 'Warning' : 'Error';
  console[WARN_ONLY ? 'warn' : 'error'](
    `${label}: the following components/ui/ files have no matching .stories.tsx:\n` +
      missing.map((f) => `  - ${f}`).join('\n') +
      '\n\nAdd a Storybook story alongside the component (see components/ui/Badge.stories.tsx for an example).',
  );

  if (!WARN_ONLY) {
    process.exit(1);
  }
}

main();

module.exports = { findComponentsMissingStories, EXEMPT, WARN_ONLY };
