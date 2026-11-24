/**
 * Tests for lib/validatorActionLogCsv.ts
 *
 * Covers:
 * - CSV header row
 * - Correct field formatting (ISO timestamp, action label, wallet, player, milestone)
 * - Null/missing optional fields rendered as empty strings
 * - RFC 4180 escaping (commas, double-quotes, newlines inside field values)
 * - Formula-injection escaping (issue #1137): values beginning with =, +, -, @, \t, \r
 *   are prefixed with a single-quote so spreadsheet apps treat them as plain text.
 */

import { buildValidatorActionLogCsv } from '@/lib/validatorActionLogCsv';
import type { ValidatorActionEntry } from '@/hooks/useValidatorActionLog';

function makeEntry(
  overrides: Partial<ValidatorActionEntry> = {},
): ValidatorActionEntry {
  return {
    id: 'approved-1',
    timestamp: 1_700_000_000,
    validator: 'GVAL1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    playerId: 'player-abc',
    milestoneId: 'milestone-xyz',
    action: 'approved',
    ...overrides,
  };
}

describe('buildValidatorActionLogCsv', () => {
  it('includes the correct header row', () => {
    const csv = buildValidatorActionLogCsv([]);
    expect(csv).toBe('timestamp,action,validator,player,milestone\n');
  });

  it('formats an approved entry as a single data row', () => {
    const entry = makeEntry();
    const csv = buildValidatorActionLogCsv([entry]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      `${new Date(1_700_000_000 * 1000).toISOString()},Milestone Approved,${entry.validator},player-abc,milestone-xyz`,
    );
  });

  it('formats a revoked entry with the correct action label', () => {
    const csv = buildValidatorActionLogCsv([makeEntry({ action: 'revoked' })]);
    const lines = csv.trim().split('\n');
    expect(lines[1]).toContain('Milestone Revoked');
  });

  it('converts the unix timestamp to an ISO 8601 string', () => {
    const ts = 1_710_000_000;
    const csv = buildValidatorActionLogCsv([makeEntry({ timestamp: ts })]);
    expect(csv).toContain(new Date(ts * 1000).toISOString());
  });

  it('renders null optional fields as empty strings', () => {
    const csv = buildValidatorActionLogCsv([
      makeEntry({ validator: null, playerId: null, milestoneId: null }),
    ]);
    const lines = csv.trim().split('\n');
    // timestamp,action,,,
    expect(lines[1]).toMatch(/^[^,]+,[^,]+,,,$/);
  });

  it('escapes field values that contain commas', () => {
    const csv = buildValidatorActionLogCsv([
      makeEntry({ playerId: 'player,with,commas' }),
    ]);
    expect(csv).toContain('"player,with,commas"');
  });

  it('escapes field values that contain double-quotes', () => {
    const csv = buildValidatorActionLogCsv([
      makeEntry({ milestoneId: 'mile"stone' }),
    ]);
    expect(csv).toContain('"mile""stone"');
  });

  it('builds multiple rows in the correct order', () => {
    const entries = [
      makeEntry({ id: '1', timestamp: 1_700_000_001, action: 'approved' }),
      makeEntry({ id: '2', timestamp: 1_700_000_002, action: 'revoked' }),
    ];
    const csv = buildValidatorActionLogCsv(entries);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('Milestone Approved');
    expect(lines[2]).toContain('Milestone Revoked');
  });

  it('terminates the output with a trailing newline', () => {
    const csv = buildValidatorActionLogCsv([makeEntry()]);
    expect(csv.endsWith('\n')).toBe(true);
  });

  // ── Formula-injection guard (issue #1137) ──────────────────────────────────

  it('prefixes a value starting with "=" with a single-quote to prevent formula injection', () => {
    const csv = buildValidatorActionLogCsv([
      makeEntry({ playerId: '=HYPERLINK("http://evil.example")' }),
    ]);
    // The single-quote prefix must appear literally in the CSV output
    expect(csv).toContain("'=HYPERLINK");
  });

  it('prefixes a value starting with "+" with a single-quote', () => {
    const csv = buildValidatorActionLogCsv([
      makeEntry({ milestoneId: '+cmd|/C calc' }),
    ]);
    expect(csv).toContain("'+cmd");
  });

  it('prefixes a value starting with "-" with a single-quote', () => {
    const csv = buildValidatorActionLogCsv([makeEntry({ playerId: '-2+3' })]);
    expect(csv).toContain("'-2+3");
  });

  it('prefixes a value starting with "@" with a single-quote', () => {
    const csv = buildValidatorActionLogCsv([
      makeEntry({ milestoneId: '@SUM(A1)' }),
    ]);
    expect(csv).toContain("'@SUM");
  });

  it('does not alter safe values that do not start with formula characters', () => {
    const csv = buildValidatorActionLogCsv([
      makeEntry({ playerId: 'player-safe', milestoneId: 'milestone-safe' }),
    ]);
    expect(csv).toContain('player-safe');
    expect(csv).toContain('milestone-safe');
    // No spurious single-quote prefix
    expect(csv).not.toContain("'player");
    expect(csv).not.toContain("'milestone");
  });

  it('applies both formula-injection prefix and RFC 4180 quoting when a formula value also contains a comma', () => {
    // e.g.  '=CMD,/C  →  "''=CMD,/C"
    const csv = buildValidatorActionLogCsv([
      makeEntry({ playerId: '=CMD,/C' }),
    ]);
    expect(csv).toContain('"\'=CMD,/C"');
  });
});
