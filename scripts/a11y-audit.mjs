/**
 * a11y-audit.mjs — automated WCAG AA contrast audit
 *
 * Starts the Next.js dev server, crawls every route, injects axe-core, and
 * collects all color-contrast violations. Exits 0 when clean, 1 otherwise.
 *
 * Usage:  node scripts/a11y-audit.mjs [--url http://localhost:3000]
 *
 * When no --url is given it spawns `next dev` on a random port automatically.
 *
 * The result-formatting and exit-code logic is factored into named exports so
 * it can be unit-tested without launching a real browser (issue #1124).
 */

import { spawn } from 'child_process';
import { createServer } from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Named `scriptDir` rather than `__dirname` so the file still parses when a
// CJS transform (Jest/Babel importing this .mjs) already injects a
// `__dirname` binding of its own.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(scriptDir, '..');
const AXE_PATH = path.resolve(ROOT, 'node_modules', 'axe-core', 'axe.min.js');

// ── Routes to scan ──────────────────────────────────────────────────────────
const ROUTES = [
  '/en',
  '/en/scout',
  '/en/scout/subscribe',
  '/en/player',
  '/en/validator',
  '/en/validator/register',
  '/en/admin',
  '/en/player/some-id',       // player profile page
  '/en/scout/some-id',         // scout profile page
  '/en/recovery',
  '/en/academy/bulk-import',
  '/en/admin/health',
  '/en/sponsorship',
  '/en/status',
  '/en/changelog',
];

// ── Exported pure helpers (testable without a browser) ───────────────────────

/**
 * Impact levels considered blocking for the exit code.
 * 'critical' and 'serious' cause a non-zero exit; 'moderate' and 'minor'
 * are reported but do not fail the run.
 */
export const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

/**
 * Returns true if a violation's impact level should cause the audit to fail.
 * @param {object} violation  An axe-core violation object (must have `.impact`).
 */
export function isBlockingViolation(violation) {
  return BLOCKING_IMPACTS.has(violation.impact);
}

/**
 * Deduplicates a flat array of axe-core violation objects by the composite
 * key `violationId::nodeHtml`.  Returns a Map whose values are
 * `{ violation, node }` pairs — one entry per unique failing node.
 *
 * @param {object[]} violations  Flat list of axe-core violation objects.
 * @returns {Map<string, {violation: object, node: object}>}
 */
export function deduplicateViolations(violations) {
  const deduped = new Map();
  for (const v of violations) {
    for (const n of v.nodes) {
      const key = `${v.id}::${n.html}`;
      if (!deduped.has(key)) {
        deduped.set(key, { violation: v, node: n });
      }
    }
  }
  return deduped;
}

/**
 * Determines the process exit code for the audit run.
 *
 * Returns 1 (fail) when at least one collected violation has a blocking
 * impact level (critical or serious); returns 0 (pass) otherwise.
 *
 * @param {object[]} allViolations  All violations collected across every route.
 * @returns {0 | 1}
 */
export function resolveExitCode(allViolations) {
  return allViolations.some(isBlockingViolation) ? 1 : 0;
}

/**
 * Builds the serialisable JSON report object from the per-route results array.
 *
 * @param {object[]} results   Array of per-route result objects produced during the scan.
 * @param {string}   baseUrl   The base URL that was audited.
 * @param {object[]} allViolations  Flat list of all violations (for the total count).
 * @returns {object}  Plain object ready for JSON.stringify.
 */
export function formatReport(results, baseUrl, allViolations) {
  return {
    timestamp: new Date().toISOString(),
    baseUrl,
    routes: results.map((r) => ({
      route: r.route,
      finalUrl: r.finalUrl,
      violationCount: r.violations.length,
      skipped: r.skipped,
      error: r.error ?? null,
      violations: r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.map((n) => ({
          target: n.target.join(', '),
          html: n.html.slice(0, 200),
          failureSummary: n.failureSummary,
        })),
      })),
    })),
    totalViolations: allViolations.length,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function getFreePort() {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function readAxeSource() {
  try {
    return fs.readFileSync(AXE_PATH, 'utf-8');
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const urlArg = process.argv.find((a) => a.startsWith('--url='));
  const customUrl = urlArg ? urlArg.slice(6) : null;

  let baseUrl = customUrl;
  let child = null;

  if (!customUrl) {
    const port = await getFreePort();
    baseUrl = `http://localhost:${port}`;

    console.log(`\n  Starting dev server on port ${port} …`);
    child = spawn('npx', ['next', 'dev', '--port', String(port)], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timed out')), 90_000);
      child.stdout.on('data', (data) => {
        const text = data.toString();
        process.stdout.write(text);
        if (text.includes('Ready') || text.includes('localhost')) {
          clearTimeout(timeout);
          setTimeout(resolve, 2000);
        }
      });
      child.stderr.on('data', (d) => process.stderr.write(d));
      child.on('error', reject);
      child.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}`));
      });
    });
  } else {
    console.log(`\n  Using existing server at ${baseUrl}`);
  }

  const axeSource = readAxeSource();
  if (!axeSource) {
    console.error('\n  FAIL: axe-core not found at', AXE_PATH);
    console.error('  Run: npm install --save-dev axe-core');
    process.exit(1);
  }

  const puppeteer = await import('puppeteer');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 30_000,
  });

  const allViolations = [];
  const results = [];

  console.log('\n  Scanning routes …\n');

  for (const route of ROUTES) {
    const url = `${baseUrl}${route}`;
    let pageViolations = [];
    let error = null;
    let finalUrl = '';

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });

      // Block requests that hang
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const u = req.url();
        if (
          u.includes('horizon') ||
          u.includes('stellar') ||
          u.includes('rpc') ||
          u.includes('soroban') ||
          u.includes('indexer') ||
          u.includes('analytics') ||
          u.includes('sentry') ||
          u.includes('api/csp-report')
        ) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // Navigate and wait for page to load
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      }).catch(() => null);

      finalUrl = page.url();

      // Wait for React to hydrate and any redirects to settle
      await new Promise((r) => setTimeout(r, 4000));

      // Check if page is still alive and has content
      const hasContent = await page.evaluate(() => {
        return document.body && document.body.textContent.trim().length > 0;
      }).catch(() => false);

      if (!hasContent) {
        console.log(`  ~  ${route}  →  ${finalUrl}  (empty page — no wallet auth)`);
        await page.close();
        results.push({ route, finalUrl, violations: [], error: null, skipped: true });
        continue;
      }

      // Inject axe-core via addScriptTag (more reliable than evaluate for large scripts)
      await page.addScriptTag({ content: axeSource }).catch(() => {});

      // Run axe
      pageViolations = await page.evaluate(() => {
        return window.axe
          .run({
            runOnly: ['color-contrast'],
            resultTypes: ['violations'],
          })
          .then((results) =>
            results.violations.filter((v) => {
              // Filter out the dev-only Next.js error overlay and any error-type violations
              if (v.id === 'error') return false;
              const targets = v.nodes.map((n) => n.target.join(' '));
              if (targets.some((t) => t.includes('nextjs-portal'))) return false;
              return true;
            }),
          )
          .catch(() => []);
      }).catch((e) => {
        error = e.message;
        return [];
      });

      await page.close();
    } catch (e) {
      error = e.message;
    }

    const skipped = results.length > 0 && results[results.length - 1]?.skipped;
    if (!skipped) {
      results.push({ route, finalUrl, violations: pageViolations, error: error, skipped: false });
      allViolations.push(...pageViolations);

      const symbol = pageViolations.length === 0 ? '  ✓' : '  ✗';
      console.log(`${symbol}  ${route}  →  ${finalUrl}`);
      console.log(`       ${pageViolations.length} violation(s)`);
      if (error) console.log(`       error: ${error}`);
    }
  }

  await browser.close();

  // Kill dev server
  if (child) {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1000));
  }

  // ── Report ──────────────────────────────────────────────────────────────
  console.log('\n  ── REPORT ──\n');

  const reportPath = path.resolve(ROOT, 'artifacts', 'a11y-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  const report = formatReport(results, baseUrl, allViolations);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`  Report saved to ${reportPath}\n`);

  const deduped = deduplicateViolations(allViolations);

  if (resolveExitCode(allViolations) !== 0) {
    console.log(`  FAILED — ${allViolations.length} total, ${deduped.size} unique violation(s).\n`);
    for (const { violation: v, node: n } of deduped.values()) {
      console.log(`  [${v.impact}] ${v.help}`);
      console.log(`         target: ${n.target.join(', ')}`);
      console.log(`         html:   ${n.html.slice(0, 120)}`);
      console.log(`         failureSummary: ${n.failureSummary}`);
      console.log();
    }
    process.exit(1);
  }

  const auditedCount = results.filter((r) => !r.skipped && !r.error).length;
  const skippedCount = results.filter((r) => r.skipped).length;
  console.log(`  PASSED — ${auditedCount} routes audited, ${skippedCount} skipped (auth required).\n`);
  process.exit(0);
}

// Only crawl when run as a CLI (`node scripts/a11y-audit.mjs`). Importing
// this module — e.g. the unit tests in __tests__/scripts — pulls in the
// pure helper exports without spawning a dev server.
const isCliEntry =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCliEntry) {
  main().catch((err) => {
    console.error('\n  Audit failed:', err.message);
    process.exit(1);
  });
}
