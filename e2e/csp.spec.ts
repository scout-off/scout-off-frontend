import { test, expect, type Page } from '@playwright/test';

/**
 * CSP-violation gate (issue #1664).
 *
 * Runs against a production build (E2E_PROD_BUILD=1, which makes
 * playwright.config.ts boot `next build && next start`; CI runs it as its own
 * step in the `e2e` job). The dev server deliberately adds 'unsafe-inline' /
 * 'unsafe-eval' to script-src for the dev overlay (lib/csp.ts), so these
 * checks are skipped there.
 *
 * Fails if script-src allows unsafe-inline/unsafe-eval, if any
 * `securitypolicyviolation` event fires, if the browser logs a CSP error, or
 * if the page POSTs a violation report to `/api/csp-report` (report-uri).
 */

const PAGES = ['/en', '/en/player/1', '/en/scout', '/en/sponsorship'];

interface Violation {
  blockedURI: string;
  violatedDirective: string;
  sourceFile: string;
}

function attachViolationListeners(page: Page): Violation[] {
  const violations: Violation[] = [];

  // report-uri delivery: the browser POSTs each violation to /api/csp-report.
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/api/csp-report')) {
      violations.push({
        blockedURI: req.postData() ?? '',
        violatedDirective: 'report-uri',
        sourceFile: '',
      });
    }
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (
      /content security policy|refused to (load|execute|apply|connect)/i.test(
        text,
      )
    ) {
      violations.push({
        blockedURI: text,
        violatedDirective: 'console',
        sourceFile: '',
      });
    }
  });

  // `securitypolicyviolation` fires on the document; register before navigation.
  page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const detail = {
        blockedURI: event.blockedURI,
        violatedDirective: event.violatedDirective,
        sourceFile: event.sourceFile,
      };
      // Surface to the test via console so the Node-side listener can collect it.
      // eslint-disable-next-line no-console
      console.error(`CSP_VIOLATION ${JSON.stringify(detail)}`);
    });
  });

  page.on('console', (msg) => {
    const text = msg.text();
    const marker = 'CSP_VIOLATION ';
    const idx = text.indexOf(marker);
    if (idx === -1) return;
    try {
      violations.push(JSON.parse(text.slice(idx + marker.length)) as Violation);
    } catch {
      violations.push({
        blockedURI: text,
        violatedDirective: 'unknown',
        sourceFile: '',
      });
    }
  });

  return violations;
}

test.describe('Content-Security-Policy', () => {
  test.skip(
    process.env.E2E_PROD_BUILD !== '1',
    'needs a production build: run with E2E_PROD_BUILD=1',
  );

  for (const path of PAGES) {
    test(`no CSP violations on ${path}`, async ({ page }) => {
      const violations = attachViolationListeners(page);

      const response = await page.goto(path, { waitUntil: 'networkidle' });
      expect(response, `navigation to ${path} should succeed`).not.toBeNull();

      const csp = response?.headers()['content-security-policy'];
      expect(csp, `CSP header missing on ${path}`).toBeTruthy();
      // Only script-src must be strict: style-src keeps 'unsafe-inline' by
      // design (lib/csp.ts).
      const scriptSrc =
        csp!
          .split(';')
          .map((d) => d.trim())
          .find((d) => d.startsWith('script-src ')) ?? '';
      expect(scriptSrc).toContain("script-src 'self'");
      expect(scriptSrc).toContain("'nonce-");
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");

      // Give late inline scripts (analytics, Sentry) a chance to run and report.
      await page.waitForTimeout(500);

      expect(
        violations,
        `CSP violations on ${path}: ${JSON.stringify(violations)}`,
      ).toEqual([]);
    });
  }
});
