/**
 * Unit tests for scripts/a11y-audit.mjs (issue #1124)
 *
 * Exercises the exported pure-logic helpers that drive result formatting and
 * the pass/fail exit-code decision.  No browser, no server, no filesystem I/O.
 *
 * Covered functions (all exported from the script):
 *   - isBlockingViolation  — distinguishes critical/serious from minor impacts
 *   - deduplicateViolations — dedupes axe nodes by (violationId, html) key
 *   - resolveExitCode       — returns 0 (pass) or 1 (fail) from violation list
 *   - formatReport          — builds the serialisable JSON report object
 */

// Loaded via beforeAll so we can use dynamic import() without top-level await,
// which keeps compatibility with Jest's default CJS/Babel transform pipeline.
let isBlockingViolation;
let deduplicateViolations;
let resolveExitCode;
let formatReport;
let BLOCKING_IMPACTS;

beforeAll(async () => {
  const mod = await import('../../scripts/a11y-audit.mjs');
  isBlockingViolation = mod.isBlockingViolation;
  deduplicateViolations = mod.deduplicateViolations;
  resolveExitCode = mod.resolveExitCode;
  formatReport = mod.formatReport;
  BLOCKING_IMPACTS = mod.BLOCKING_IMPACTS;
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeViolation(impact, id = 'color-contrast', html = '<div>x</div>') {
  return {
    id,
    impact,
    description: `${id} violation`,
    help: `Fix ${id}`,
    helpUrl: `https://example.com/${id}`,
    nodes: [
      {
        target: ['div'],
        html,
        failureSummary: 'Fix the contrast',
      },
    ],
  };
}

function makeResult(route, violations = [], { skipped = false, error = null } = {}) {
  return {
    route,
    finalUrl: `http://localhost:3000${route}`,
    violations,
    skipped,
    error,
  };
}

// ── isBlockingViolation ───────────────────────────────────────────────────────

describe('isBlockingViolation', () => {
  test('returns true for critical impact', () => {
    expect(isBlockingViolation(makeViolation('critical'))).toBe(true);
  });

  test('returns true for serious impact', () => {
    expect(isBlockingViolation(makeViolation('serious'))).toBe(true);
  });

  test('returns false for moderate impact', () => {
    expect(isBlockingViolation(makeViolation('moderate'))).toBe(false);
  });

  test('returns false for minor impact', () => {
    expect(isBlockingViolation(makeViolation('minor'))).toBe(false);
  });

  test('BLOCKING_IMPACTS set contains exactly critical and serious', () => {
    expect(BLOCKING_IMPACTS.has('critical')).toBe(true);
    expect(BLOCKING_IMPACTS.has('serious')).toBe(true);
    expect(BLOCKING_IMPACTS.has('moderate')).toBe(false);
    expect(BLOCKING_IMPACTS.has('minor')).toBe(false);
  });
});

// ── resolveExitCode ───────────────────────────────────────────────────────────

describe('resolveExitCode', () => {
  test('returns 0 when there are no violations', () => {
    expect(resolveExitCode([])).toBe(0);
  });

  test('returns 0 when all violations are minor', () => {
    expect(resolveExitCode([makeViolation('minor'), makeViolation('moderate')])).toBe(0);
  });

  test('returns 1 when there is at least one critical violation', () => {
    expect(resolveExitCode([makeViolation('critical')])).toBe(1);
  });

  test('returns 1 when there is at least one serious violation', () => {
    expect(resolveExitCode([makeViolation('serious')])).toBe(1);
  });

  test('returns 1 when violations are mixed minor and critical', () => {
    expect(
      resolveExitCode([makeViolation('minor'), makeViolation('critical')]),
    ).toBe(1);
  });

  test('returns 0 when violations are only moderate (non-blocking)', () => {
    expect(resolveExitCode([makeViolation('moderate')])).toBe(0);
  });
});

// ── deduplicateViolations ─────────────────────────────────────────────────────

describe('deduplicateViolations', () => {
  test('returns an empty Map for an empty input', () => {
    expect(deduplicateViolations([])).toEqual(new Map());
  });

  test('returns one entry for a single violation with one node', () => {
    const violations = [makeViolation('serious')];
    const deduped = deduplicateViolations(violations);
    expect(deduped.size).toBe(1);
  });

  test('deduplicates two nodes with the same id and html into one entry', () => {
    const html = '<button>bad</button>';
    const v1 = makeViolation('critical', 'color-contrast', html);
    const v2 = makeViolation('critical', 'color-contrast', html);
    const deduped = deduplicateViolations([v1, v2]);
    expect(deduped.size).toBe(1);
  });

  test('keeps two entries when the same violation id appears with different html', () => {
    const v1 = makeViolation('serious', 'color-contrast', '<div>A</div>');
    const v2 = makeViolation('serious', 'color-contrast', '<div>B</div>');
    const deduped = deduplicateViolations([v1, v2]);
    expect(deduped.size).toBe(2);
  });

  test('keeps two entries when different violation ids share the same html', () => {
    const html = '<div>x</div>';
    const v1 = makeViolation('serious', 'color-contrast', html);
    const v2 = makeViolation('serious', 'label', html);
    const deduped = deduplicateViolations([v1, v2]);
    expect(deduped.size).toBe(2);
  });

  test('each Map value has { violation, node } shape', () => {
    const violations = [makeViolation('critical')];
    const deduped = deduplicateViolations(violations);
    const [entry] = deduped.values();
    expect(entry).toHaveProperty('violation');
    expect(entry).toHaveProperty('node');
    expect(entry.violation.id).toBe('color-contrast');
  });

  test('a violation with multiple nodes produces one entry per unique node', () => {
    const v = {
      ...makeViolation('serious'),
      nodes: [
        { target: ['div'], html: '<div>A</div>', failureSummary: 'Fix' },
        { target: ['span'], html: '<span>B</span>', failureSummary: 'Fix' },
      ],
    };
    const deduped = deduplicateViolations([v]);
    expect(deduped.size).toBe(2);
  });
});

// ── formatReport ─────────────────────────────────────────────────────────────

describe('formatReport', () => {
  test('includes baseUrl, totalViolations, and a routes array', () => {
    const report = formatReport([], 'http://localhost:3000', []);
    expect(report).toHaveProperty('baseUrl', 'http://localhost:3000');
    expect(report).toHaveProperty('totalViolations', 0);
    expect(report).toHaveProperty('routes');
    expect(Array.isArray(report.routes)).toBe(true);
  });

  test('totalViolations reflects the length of allViolations', () => {
    const violations = [makeViolation('critical'), makeViolation('serious')];
    const report = formatReport([], 'http://localhost:3000', violations);
    expect(report.totalViolations).toBe(2);
  });

  test('includes a timestamp field', () => {
    const report = formatReport([], 'http://localhost:3000', []);
    expect(report).toHaveProperty('timestamp');
    expect(() => new Date(report.timestamp)).not.toThrow();
  });

  test('maps a clean route result to a routes entry with violationCount 0', () => {
    const results = [makeResult('/en')];
    const report = formatReport(results, 'http://localhost:3000', []);
    expect(report.routes).toHaveLength(1);
    expect(report.routes[0].route).toBe('/en');
    expect(report.routes[0].violationCount).toBe(0);
    expect(report.routes[0].skipped).toBe(false);
    expect(report.routes[0].error).toBeNull();
  });

  test('maps a skipped route to a routes entry with skipped: true', () => {
    const results = [makeResult('/en/admin', [], { skipped: true })];
    const report = formatReport(results, 'http://localhost:3000', []);
    expect(report.routes[0].skipped).toBe(true);
  });

  test('maps a route with violations to the correct violationCount', () => {
    const violations = [makeViolation('critical')];
    const results = [makeResult('/en', violations)];
    const report = formatReport(results, 'http://localhost:3000', violations);
    expect(report.routes[0].violationCount).toBe(1);
    expect(report.totalViolations).toBe(1);
  });

  test('truncates node html in violation details to 200 chars', () => {
    const longHtml = 'x'.repeat(300);
    const v = {
      ...makeViolation('serious'),
      nodes: [{ target: ['div'], html: longHtml, failureSummary: 'Fix' }],
    };
    const results = [makeResult('/en', [v])];
    const report = formatReport(results, 'http://localhost:3000', [v]);
    const nodeHtml = report.routes[0].violations[0].nodes[0].html;
    expect(nodeHtml.length).toBeLessThanOrEqual(200);
  });

  test('joins multi-element node targets into a comma-separated string', () => {
    const v = {
      ...makeViolation('critical'),
      nodes: [
        {
          target: ['#main', 'button', '.label'],
          html: '<button>x</button>',
          failureSummary: 'Fix',
        },
      ],
    };
    const results = [makeResult('/en', [v])];
    const report = formatReport(results, 'http://localhost:3000', [v]);
    expect(report.routes[0].violations[0].nodes[0].target).toBe(
      '#main, button, .label',
    );
  });

  test('route entry preserves error message when a page scan errored', () => {
    const results = [makeResult('/en', [], { error: 'Navigation timeout' })];
    const report = formatReport(results, 'http://localhost:3000', []);
    expect(report.routes[0].error).toBe('Navigation timeout');
  });
});
