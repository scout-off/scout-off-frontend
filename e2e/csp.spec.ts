import { test, expect, type Page } from '@playwright/test';

/**
 * CSP-violation gate (issue #1664).
 *
 * Runs against the production build used by the `e2e` CI job. Fails if any
 * `securitypolicyviolation` event fires, if the browser logs a CSP error, or if
 * the app's `/api/csp-report` endpoint received a report during the run.
 */

const PAGES = ['/en', '/en/player/1', '/en/scout', '/en/sponsorship'];

interface Violation {
  blockedURI: string;
  violatedDirective: string;
  sourceFile: string;
}

function attachViolationListeners(page: Page): Violation[] {
  const violations: Violation[] = [];

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
  for (const path of PAGES) {
    test(`no CSP violations on ${path}`, async ({ page }) => {
      const violations = attachViolationListeners(page);

      const response = await page.goto(path, { waitUntil: 'networkidle' });
      expect(response, `navigation to ${path} should succeed`).not.toBeNull();

      const csp = response?.headers()['content-security-policy'];
      expect(csp, `CSP header missing on ${path}`).toBeTruthy();
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain('nonce-');
      expect(csp).not.toContain("'unsafe-inline'");

      // Give late inline scripts (analytics, Sentry) a chance to run and report.
      await page.waitForTimeout(500);

      expect(
        violations,
        `CSP violations on ${path}: ${JSON.stringify(violations)}`,
      ).toEqual([]);
    });
  }

  test('no CSP reports were posted during the run', async ({ request }) => {
    const response = await request.get('/api/csp-report');
    expect(
      response.ok(),
      'GET /api/csp-report should be reachable',
    ).toBeTruthy();

    const body = (await response.json()) as {
      count?: number;
      reports?: unknown[];
    };
    const count = body.count ?? body.reports?.length ?? 0;
    expect(count, 'expected zero CSP reports').toBe(0);
  });
});
