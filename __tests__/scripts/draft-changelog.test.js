const {
  categorizeCommit,
  buildEntry,
  insertEntry,
  latestEntryDate,
} = require('../../scripts/draft-changelog');

const FIXTURE_HISTORY = [
  'feat(scout): add player compare export (#1721)',
  'fix(auth): prevent duplicate session creation',
  'perf: lazy-load admin charts',
  'refactor(ui): extract DataTable primitive Closes #1720',
  'chore: tidy imports',
  'ci: cache node_modules',
  'test: add parseApiError tests',
  'docs: update README',
  'build(deps): bump next from 15.0.0 to 15.1.0',
  'fix(deps): bump axios from 1.0.0 to 1.1.0',
  'Merge pull request #800 from someone/branch',
  'feat: add player compare export (#1721)',
];

describe('draft-changelog', () => {
  it('maps user-facing commit types to sections', () => {
    expect(categorizeCommit('feat: x')).toEqual({
      section: 'Added',
      text: 'X',
    });
    expect(categorizeCommit('perf: y')?.section).toBe('Improved');
    expect(categorizeCommit('refactor(a)!: z')?.section).toBe('Improved');
    expect(categorizeCommit('fix: w')?.section).toBe('Fixed');
  });

  it.each([
    'chore: a',
    'ci: a',
    'test: a',
    'docs: a',
    'build: a',
    'build(deps): bump x from 1 to 2',
    'fix(deps): bump x from 1 to 2',
    'feat: bump x from 1.0.0 to 2.0.0',
    'not conventional',
    'fix: #12',
  ])('excludes %p', (subject) => {
    expect(categorizeCommit(subject)).toBeNull();
  });

  it('generates a formatted entry from a fixture history', () => {
    expect(
      buildEntry(FIXTURE_HISTORY, { title: 'Release 1.2', date: '2026-11-19' }),
    ).toBe(
      [
        '## Release 1.2 - 2026-11-19',
        '',
        '### Added',
        '',
        '- Add player compare export',
        '',
        '### Improved',
        '',
        '- Lazy-load admin charts',
        '- Extract DataTable primitive',
        '',
        '### Fixed',
        '',
        '- Prevent duplicate session creation',
        '',
      ].join('\n'),
    );
  });

  it('returns null when nothing is user-facing', () => {
    expect(buildEntry(['chore: a'], { title: 't', date: '2026-01-01' })).toBe(
      null,
    );
  });

  it('inserts the entry above existing entries', () => {
    const md =
      '# Changelog\n\nIntro.\n\n## Old - 2026-01-01\n\n### Fixed\n\n- a\n';
    const out = insertEntry(md, '## New - 2026-02-01\n\n### Added\n\n- b\n');
    expect(out.indexOf('## New')).toBeLessThan(out.indexOf('## Old'));
    expect(out.startsWith('# Changelog')).toBe(true);
    expect(insertEntry('# Changelog', '## New - 2026-02-01\n')).toBe(
      '# Changelog\n\n## New - 2026-02-01\n',
    );
  });

  it('reads the latest entry date', () => {
    expect(latestEntryDate('## A - 2026-07-28\n## B - 2026-01-01')).toBe(
      '2026-07-28',
    );
    expect(latestEntryDate('# Changelog')).toBeNull();
  });
});
