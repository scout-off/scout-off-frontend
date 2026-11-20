import {
  buildChangelogEntry,
  classifyCommit,
  formatChangelogEntry,
  insertChangelogEntry,
  latestChangelogDate,
  parseChangelogMarkdown,
} from '@/lib/changelog';

// Fixture git history (output of `git log --format=%s`).
const FIXTURE_LOG = [
  'feat(scout): add player compare export (#120)',
  'fix(sessions): refresh an expired access token before giving up on revoke',
  'perf(feed): virtualise the discovery list',
  'refactor: simplify upload chunking Closes #99',
  'chore: tidy imports',
  'ci(e2e): bump timeout',
  'test: cover offline queue',
  'docs: update README',
  'build: upgrade next',
  'fix(deps): bump lodash from 4.17.20 to 4.17.21',
  'feat: Bump nothing really',
  'not a conventional commit',
  'feat(scout): add player compare export (#120)',
];

describe('classifyCommit', () => {
  it('maps feat/perf/refactor/fix to sections', () => {
    expect(classifyCommit('feat: add x')).toEqual({
      type: 'added',
      item: 'Add x',
    });
    expect(classifyCommit('perf: faster x')?.type).toBe('improved');
    expect(classifyCommit('refactor!: rework x')?.type).toBe('improved');
    expect(classifyCommit('fix(api): handle x')?.type).toBe('fixed');
  });

  it('strips scope and issue refs and keeps PR links', () => {
    expect(classifyCommit('fix(auth): stop loops fixes #12 (#34)')).toEqual({
      type: 'fixed',
      item: 'Stop loops (#34)',
    });
  });

  it.each([
    'chore: x',
    'ci: x',
    'test: x',
    'docs: x',
    'build: x',
    'fix(deps): bump a from 1 to 2',
    'feat: bump a',
    'random text',
    'feat: Closes #1',
  ])('skips non-user-facing commit %p', (subject) => {
    expect(classifyCommit(subject)).toBeNull();
  });
});

describe('drafting from a fixture git history', () => {
  const entry = buildChangelogEntry(
    FIXTURE_LOG,
    'November release',
    '2026-11-20',
  );

  it('generates a correctly formatted entry', () => {
    expect(formatChangelogEntry(entry!)).toBe(
      [
        '## November release - 2026-11-20',
        '',
        '### Added',
        '',
        '- Add player compare export (#120)',
        '',
        '### Improved',
        '',
        '- Virtualise the discovery list',
        '- Simplify upload chunking',
        '',
        '### Fixed',
        '',
        '- Refresh an expired access token before giving up on revoke',
        '',
      ].join('\n'),
    );
  });

  it('round-trips through the changelog page parser', () => {
    expect(parseChangelogMarkdown(formatChangelogEntry(entry!))).toEqual([
      entry,
    ]);
  });

  it('returns null when nothing is user-facing', () => {
    expect(
      buildChangelogEntry(['chore: x', 'ci: y'], 't', '2026-01-01'),
    ).toBeNull();
  });
});

describe('insertChangelogEntry / latestChangelogDate', () => {
  const existing =
    '<!-- note -->\n\n# Changelog\n\nIntro.\n\n## Old - 2026-07-28\n\n### Fixed\n\n- Old fix\n';

  it('inserts the entry above older entries and parses both', () => {
    const entry = buildChangelogEntry(
      ['feat: new thing'],
      'New',
      '2026-11-20',
    )!;
    const result = insertChangelogEntry(existing, formatChangelogEntry(entry));
    const parsed = parseChangelogMarkdown(result);
    expect(parsed.map((e) => e.title)).toEqual(['New', 'Old']);
    expect(latestChangelogDate(result)).toBe('2026-11-20');
  });

  it('appends when there are no entries yet', () => {
    const result = insertChangelogEntry('# Changelog\n', '## A - 2026-01-01\n');
    expect(result).toBe('# Changelog\n\n## A - 2026-01-01\n');
    expect(latestChangelogDate('# Changelog\n')).toBeNull();
  });
});

describe('parseChangelogMarkdown', () => {
  it('ignores malformed headings, unknown sections, and orphan items', () => {
    const md = [
      '- orphan',
      '### Added',
      '## No date here',
      '### Added',
      '- skipped',
      '## Real - 2026-01-01',
      '### Removed',
      '- ignored',
      '### Fixed',
      '- kept',
      '## Empty - 2026-01-02',
    ].join('\r\n');
    expect(parseChangelogMarkdown(md)).toEqual([
      {
        title: 'Real',
        date: '2026-01-01',
        sections: [{ type: 'fixed', items: ['kept'] }],
      },
    ]);
  });
});
