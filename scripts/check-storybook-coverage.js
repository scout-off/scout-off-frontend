#!/usr/bin/env node
/**
 * Checks that shared UI primitives and other component directories have
 * matching Storybook stories, so story-coverage gaps don't quietly reopen
 * as new components are added.
 *
 * Per-directory configuration:
 *
 *   warnOnly: false  → exit 1 on any missing story (blocking gate)
 *   warnOnly: true   → print a warning and exit 0 (non-blocking, tracked)
 *
 * components/ui/ is now a BLOCKING gate (issue #1524 / was issue #1166).
 * The small number of ui/ components intentionally excluded are listed in
 * that directory's EXEMPT set below, each with a reason.
 *
 * components/scout/, components/player/, components/admin/ are warn-only
 * for now — their story gaps are tracked in issue #1524 and will be flipped
 * to blocking as each directory's coverage is filled.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/**
 * @typedef {{ dir: string, warnOnly: boolean, exempt: Set<string> }} DirConfig
 */

/** @type {DirConfig[]} */
const DIRS = [
  {
    dir: path.join(ROOT, 'components', 'ui'),
    label: 'components/ui',
    warnOnly: false, // BLOCKING — issue #1166 closed, gate is now enforced
    // Components intentionally exempt from needing a story. Each entry must
    // have a comment explaining why. Do not add exemptions just because a
    // component is small — only when a story is genuinely not appropriate.
    exempt: new Set([
      // Wraps Cloudflare Turnstile widget — requires external script injection
      // and a real siteKey; not independently renderable in Storybook.
      'Turnstile.tsx',
      // Gate that conditionally renders children based on cookie consent;
      // meaningful testing requires real localStorage state and the banner.
      'CookieConsentGate.tsx',
      // Renders a link that triggers the CookieConsentBanner imperative API
      // (reopenConsentBanner); story would just be a bare <a> with no state.
      'CookieSettingsLink.tsx',
      // Uses useIndexerFreshness (SWR + live indexer endpoint); stubs needed
      // before a story is useful — tracked in issue #1524 follow-up.
      'DataFreshnessBadge.tsx',
      // Cookie consent banner — useEffect + localStorage; add story once
      // the consent-flow MSW mock is in place (issue #1524 follow-up).
      'CookieConsentBanner.tsx',
      // Pure layout wrapper (children + back-link). Trivial to story but
      // deferred to a separate pass with other legal-page components.
      'LegalPageLayout.tsx',
      // Multi-step tour driven by useOnboardingTour; story needs a full
      // step fixture and portal; deferred to issue #1524 follow-up.
      'OnboardingTour.tsx',
      // Reads URL search params via useSearchParams for redirect reasons;
      // requires router-mocking setup; deferred to issue #1524 follow-up.
      'RedirectReasonBanner.tsx',
      // useEffect scroll-position tracker; visual output is a button that
      // only appears after scroll; deferred to issue #1524 follow-up.
      'ScrollToTop.tsx',
      // useTheme hook reads/writes document.documentElement class; story
      // needs decorator to reset DOM between renders; deferred #1524 follow-up.
      'ThemeToggle.tsx',
    ]),
  },
  {
    dir: path.join(ROOT, 'components', 'scout'),
    label: 'components/scout',
    warnOnly: true, // warn-only until coverage gap closed (issue #1524)
    exempt: new Set([]),
  },
  {
    dir: path.join(ROOT, 'components', 'player'),
    label: 'components/player',
    warnOnly: true, // warn-only until coverage gap closed (issue #1524)
    exempt: new Set([]),
  },
  {
    dir: path.join(ROOT, 'components', 'admin'),
    label: 'components/admin',
    warnOnly: true, // warn-only until coverage gap closed (issue #1524)
    exempt: new Set([]),
  },
];

/**
 * Returns the list of .tsx component files in `dir` that have no matching
 * .stories.tsx file and are not in the exempt set.
 *
 * @param {DirConfig} config
 * @returns {string[]}
 */
function findComponentsMissingStories({ dir, exempt }) {
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir);
  const components = files
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.stories.tsx'))
    .filter((f) => !exempt.has(f));

  return components.filter((f) => {
    const storyFile = f.replace(/\.tsx$/, '.stories.tsx');
    return !files.includes(storyFile);
  });
}

function main() {
  let anyBlockingFailure = false;

  for (const config of DIRS) {
    const missing = findComponentsMissingStories(config);

    if (missing.length === 0) {
      console.log(
        `Storybook coverage ✅ ${config.label}: all components have stories.`,
      );
      continue;
    }

    const label = config.warnOnly ? 'Warning' : 'Error';
    const lines =
      `${label}: the following ${config.label} files have no matching .stories.tsx:\n` +
      missing.map((f) => `  - ${f}`).join('\n') +
      '\n\nAdd a Storybook story alongside the component (see components/ui/Badge.stories.tsx for an example).';

    if (config.warnOnly) {
      console.warn(lines);
    } else {
      console.error(lines);
      anyBlockingFailure = true;
    }
  }

  if (anyBlockingFailure) {
    process.exit(1);
  }
}

main();

// Export for unit tests and other scripts.
module.exports = { findComponentsMissingStories, DIRS };
