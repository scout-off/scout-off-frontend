import { parseChangelogMarkdown } from '@/lib/changelog';
const { buildEntry, insertEntry } = require('../../scripts/draft-changelog');

describe('parseChangelogMarkdown', () => {
  it('round-trips a drafted entry from scripts/draft-changelog.js', () => {
    const entry = buildEntry(
      [
        'feat(scout): add compare export (#1721)',
        'perf: faster admin tables',
        'fix: correct toast text',
        'chore: ignored',
      ],
      { title: 'Release 1.2', date: '2026-11-19' },
    );
    const md = insertEntry(
      '# Changelog\n\n## Old - 2026-01-01\n\n### Fixed\n\n- older\n',
      entry,
    );

    expect(parseChangelogMarkdown(md)).toEqual([
      {
        title: 'Release 1.2',
        date: '2026-11-19',
        sections: [
          { type: 'added', items: ['Add compare export'] },
          { type: 'improved', items: ['Faster admin tables'] },
          { type: 'fixed', items: ['Correct toast text'] },
        ],
      },
      {
        title: 'Old',
        date: '2026-01-01',
        sections: [{ type: 'fixed', items: ['older'] }],
      },
    ]);
  });

  it('ignores malformed headings, unknown sections and orphan items', () => {
    const md = [
      '- orphan',
      '### Added',
      '## No date heading',
      '- dropped',
      '## Valid - 2026-02-02',
      '### Removed',
      '- dropped',
      '### Added',
      '- kept',
      '## Empty - 2026-03-03',
    ].join('\r\n');
    expect(parseChangelogMarkdown(md)).toEqual([
      {
        title: 'Valid',
        date: '2026-02-02',
        sections: [{ type: 'added', items: ['kept'] }],
      },
    ]);
  });
});
