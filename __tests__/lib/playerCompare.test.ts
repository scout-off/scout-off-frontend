import {
  buildCompareCsv,
  COMPARE_METRICS,
  findAllLeaders,
  findLeaders,
  type CompareMetric,
} from '@/lib/playerCompare';
import type { Player } from '@/types';

const player = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  wallet: `G${id}`,
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

const goals = COMPARE_METRICS.find((m) => m.key === 'goals')!;

describe('findLeaders', () => {
  it('marks the single highest value', () => {
    const players = [
      player('a', { stats: { goals: 3, assists: 0, appearances: 0 } }),
      player('b', { stats: { goals: 9, assists: 0, appearances: 0 } }),
    ];
    expect(findLeaders(players, goals)).toEqual(new Set(['b']));
  });

  it('marks every tied player', () => {
    const players = [
      player('a', { stats: { goals: 9, assists: 0, appearances: 0 } }),
      player('b', { stats: { goals: 9, assists: 0, appearances: 0 } }),
      player('c', { stats: { goals: 1, assists: 0, appearances: 0 } }),
    ];
    expect(findLeaders(players, goals)).toEqual(new Set(['a', 'b']));
  });

  it('never treats missing or non-finite values as best', () => {
    const players = [
      player('a'),
      player('b', { stats: { goals: 0, assists: 0, appearances: 0 } }),
      player('c', { stats: { goals: NaN, assists: 0, appearances: 0 } }),
      player('d', { stats: { goals: -1, assists: 0, appearances: 0 } }),
    ];
    expect(findLeaders(players, goals)).toEqual(new Set(['b']));
  });

  it('returns no leader when fewer than two players have a value', () => {
    expect(
      findLeaders(
        [
          player('a', { stats: { goals: 5, assists: 0, appearances: 0 } }),
          player('b'),
        ],
        goals,
      ),
    ).toEqual(new Set());
  });

  it('honours lower-is-better metrics', () => {
    const lower: CompareMetric = {
      key: 'goals',
      direction: 'lower',
      value: (p) => p.stats?.goals,
    };
    const players = [
      player('a', { stats: { goals: 2, assists: 0, appearances: 0 } }),
      player('b', { stats: { goals: 1, assists: 0, appearances: 0 } }),
    ];
    expect(findLeaders(players, lower)).toEqual(new Set(['b']));
  });

  it('computes leaders for every metric', () => {
    const leaders = findAllLeaders([
      player('a', { progressLevel: 3 }),
      player('b', { progressLevel: 1 }),
    ]);
    expect(leaders.progressLevel).toEqual(new Set(['a']));
    expect(leaders.goals).toEqual(new Set());
  });
});

describe('buildCompareCsv', () => {
  const labels = {
    name: 'Name',
    age: 'Age',
    position: 'Position',
    region: 'Region',
    nationality: 'Nationality',
    progressLevel: 'Progress',
    goals: 'Goals',
    assists: 'Assists',
    appearances: 'Appearances',
    clean_sheets: 'Clean sheets',
    milestones: 'Milestones',
  };

  it('writes one row per field and one column per player', () => {
    const csv = buildCompareCsv(
      [
        player('a', { stats: { goals: 4, assists: 0, appearances: 0 } }),
        player('b'),
      ],
      labels,
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Name,Player a,Player b');
    expect(lines).toContain('Goals,4,');
    expect(lines).toHaveLength(11);
  });

  it('is formula-safe and excludes contact details', () => {
    const p = player('a', {
      vitals: {
        name: '=HYPERLINK("x")',
        age: 20,
        position: 'ST',
        region: 'R',
        nationality: 'N',
      },
    });
    const csv = buildCompareCsv([p], labels);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).not.toMatch(/email|phone|telegram|wallet/i);
    expect(csv).not.toContain(p.wallet);
  });
});
