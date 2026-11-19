import {
  buildCompareCsv,
  COMPARE_METRICS,
  findLeaders,
  getLeadersByMetric,
} from '@/lib/playerCompare';
import type { Player } from '@/types';

const player = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  wallet: 'G'.padEnd(56, 'A'),
  vitals: {
    name: `Player ${id}`,
    age: 20,
    position: 'ST',
    region: 'West Africa',
    nationality: 'Ghanaian',
  },
  ipfsHash: '',
  progressLevel: 0,
  milestones: [],
  createdAt: 0,
  archived: false,
  ...overrides,
});

describe('findLeaders', () => {
  it('returns the single highest index', () => {
    expect(findLeaders([1, 5, 3], 'higher')).toEqual([1]);
  });

  it('returns the lowest for lower-is-better', () => {
    expect(findLeaders([4, 2, 9], 'lower')).toEqual([1]);
  });

  it('returns every tied index', () => {
    expect(findLeaders([7, 3, 7, 7], 'higher')).toEqual([0, 2, 3]);
  });

  it('never treats missing values as best', () => {
    expect(findLeaders([undefined, 0, null, NaN], 'lower')).toEqual([]);
    expect(findLeaders([undefined, 2, null, 1], 'lower')).toEqual([3]);
  });

  it('returns no leader with fewer than two present values', () => {
    expect(findLeaders([undefined, 4], 'higher')).toEqual([]);
    expect(findLeaders([], 'higher')).toEqual([]);
  });
});

describe('getLeadersByMetric', () => {
  it('maps every configured metric to leading player ids', () => {
    const players = [
      player('a', {
        progressLevel: 2,
        stats: { goals: 5, assists: 1, appearances: 10 },
      }),
      player('b', {
        progressLevel: 2,
        stats: { goals: 3, assists: 4, appearances: 10, clean_sheets: 2 },
      }),
    ];
    const leaders = getLeadersByMetric(players);
    expect(Object.keys(leaders).sort()).toEqual(
      COMPARE_METRICS.map((m) => m.key).sort(),
    );
    expect([...leaders.goals]).toEqual(['a']);
    expect([...leaders.assists]).toEqual(['b']);
    expect([...leaders.appearances]).toEqual(['a', 'b']);
    expect([...leaders.clean_sheets]).toEqual([]);
    expect([...leaders.progressLevel]).toEqual(['a', 'b']);
  });
});

describe('buildCompareCsv', () => {
  const labels = {
    attribute: 'Attribute',
    age: 'Age',
    position: 'Position',
    region: 'Region',
    nationality: 'Nationality',
    milestones: 'Milestones',
    goals: 'Goals',
    assists: 'Assists',
    appearances: 'Appearances',
    clean_sheets: 'Clean sheets',
    progressLevel: 'Progress',
  };

  it('builds one column per player and is formula-safe', () => {
    const csv = buildCompareCsv(
      [
        player('a', {
          vitals: {
            name: '=HYPERLINK("x")',
            age: 19,
            position: 'ST',
            region: 'West, Africa',
            nationality: 'Ghanaian',
          },
          stats: { goals: 4, assists: 2, appearances: 9 },
        }),
        player('b'),
      ],
      labels,
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe(`Attribute,"'=HYPERLINK(""x"")",Player b`);
    expect(lines).toContain('Region,"West, Africa",West Africa');
    expect(lines).toContain('Goals,4,');
    expect(lines).toContain('Clean sheets,,');
    expect(lines).toContain('Milestones,0,0');
  });

  it('never includes contact details or wallets', () => {
    const csv = buildCompareCsv([player('a')], labels);
    expect(csv).not.toContain('GAAA');
    expect(csv.toLowerCase()).not.toMatch(/email|phone|telegram/);
  });
});
