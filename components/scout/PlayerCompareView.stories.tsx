import type { Meta, StoryObj } from '@storybook/react';
import PlayerCompareView from './PlayerCompareView';
import type { Player } from '@/types';

const meta: Meta<typeof PlayerCompareView> = {
  title: 'Components/PlayerCompareView',
  component: PlayerCompareView,
  tags: ['autodocs'],
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof PlayerCompareView>;

// ── Shared mock data helpers ─────────────────────────────────────────────────

const basePlayer = (overrides: Partial<Player>): Player => ({
  id: 'player_001',
  wallet: 'GBKR6LYRKEFYV3MG322FYLED6PLOTEV77KCX6AZSR7V4RV7EJLIWOZJW',
  vitals: {
    name: 'Kwame Asante',
    age: 20,
    position: 'ST',
    region: 'West Africa',
    nationality: 'Ghanaian',
  },
  ipfsHash: '',
  progressLevel: 0,
  milestones: [],
  createdAt: 1_700_000_000,
  archived: false,
  ...overrides,
});

const createMilestone = (
  id: string,
  description: string,
): Player['milestones'][0] => ({
  id,
  description,
  evidenceHash: `QmHash${id}`,
  validator: 'GBVALIADDR1111111111111111111111111111111111111111111111',
  timestamp: 1_700_000_000 + Number(id.split('_')[1]) * 100_000,
});

// ── Stories ───────────────────────────────────────────────────────────────────

/** Two players side-by-side comparison. */
export const TwoPlayers: Story = {
  args: {
    players: [
      basePlayer({
        id: 'player_001',
        vitals: {
          name: 'Kwame Asante',
          age: 20,
          position: 'ST',
          region: 'West Africa',
          nationality: 'Ghanaian',
        },
        progressLevel: 1,
        stats: { goals: 12, assists: 5, appearances: 25 },
        milestones: [
          createMilestone('ms_001', 'Scored hat-trick in regional final'),
        ],
      }),
      basePlayer({
        id: 'player_002',
        wallet: 'GDPF7BZSMAKLJYT4XSYVMAQGZ5LW3MV7KCXP5KBJDNNQJF5Z6VQL3FE',
        vitals: {
          name: 'Amina Waweru',
          age: 18,
          position: 'GK',
          region: 'East Africa',
          nationality: 'Kenyan',
        },
        progressLevel: 2,
        stats: { goals: 0, assists: 0, appearances: 30, clean_sheets: 15 },
        milestones: [
          createMilestone('ms_002', 'Clean sheet in national championship'),
          createMilestone('ms_003', 'Called to U-20 national team'),
        ],
      }),
    ],
  },
};

/** Maximum number of players (4) in the comparison view. */
export const MaximumPlayers: Story = {
  args: {
    players: [
      basePlayer({
        id: 'player_001',
        vitals: {
          name: 'Kwame Asante',
          age: 20,
          position: 'ST',
          region: 'West Africa',
          nationality: 'Ghanaian',
        },
        progressLevel: 1,
        stats: { goals: 12, assists: 5, appearances: 25 },
        milestones: [
          createMilestone('ms_001', 'Scored hat-trick in regional final'),
        ],
      }),
      basePlayer({
        id: 'player_002',
        wallet: 'GDPF7BZSMAKLJYT4XSYVMAQGZ5LW3MV7KCXP5KBJDNNQJF5Z6VQL3FE',
        vitals: {
          name: 'Amina Waweru',
          age: 18,
          position: 'GK',
          region: 'East Africa',
          nationality: 'Kenyan',
        },
        progressLevel: 2,
        stats: { goals: 0, assists: 0, appearances: 30, clean_sheets: 15 },
        milestones: [
          createMilestone('ms_002', 'Clean sheet in national championship'),
          createMilestone('ms_003', 'Called to U-20 national team'),
        ],
      }),
      basePlayer({
        id: 'player_003',
        wallet: 'GCZE3GXSNZV7JDXM5YVAQXRPZULBGZ5W3TKKD4MZGV7QJRFWU6A7OLP',
        vitals: {
          name: 'Emeka Okafor',
          age: 22,
          position: 'CAM',
          region: 'West Africa',
          nationality: 'Nigerian',
        },
        progressLevel: 3,
        stats: { goals: 8, assists: 15, appearances: 35 },
        milestones: [
          createMilestone('ms_004', 'Top assists in league'),
          createMilestone('ms_005', 'MVP of continental tournament'),
        ],
      }),
      basePlayer({
        id: 'player_004',
        wallet: 'GDRK7XPMQKFM5WT3YCNZPF4YLGMSWTVN5FCNLSDJHQZEBGR4K6YZXPN',
        vitals: {
          name: 'Fatou Diallo',
          age: 19,
          position: 'LW',
          region: 'West Africa',
          nationality: 'Senegalese',
        },
        progressLevel: 1,
        stats: { goals: 10, assists: 7, appearances: 28 },
        milestones: [createMilestone('ms_006', 'Young player of the season')],
      }),
    ],
  },
};

/** Player with missing stats - stats section should not render. */
export const PlayerWithMissingStats: Story = {
  args: {
    players: [
      basePlayer({
        id: 'player_001',
        vitals: {
          name: 'Kwame Asante',
          age: 20,
          position: 'ST',
          region: 'West Africa',
          nationality: 'Ghanaian',
        },
        progressLevel: 1,
        stats: { goals: 12, assists: 5, appearances: 25 },
        milestones: [
          createMilestone('ms_001', 'Scored hat-trick in regional final'),
        ],
      }),
      basePlayer({
        id: 'player_002',
        wallet: 'GDPF7BZSMAKLJYT4XSYVMAQGZ5LW3MV7KCXP5KBJDNNQJF5Z6VQL3FE',
        vitals: {
          name: 'Amina Waweru',
          age: 18,
          position: 'GK',
          region: 'East Africa',
          nationality: 'Kenyan',
        },
        progressLevel: 0,
        // No stats - should not render stats section
        milestones: [],
      }),
    ],
  },
};

/** Player with a very long name to test layout handling. */
export const LongName: Story = {
  args: {
    players: [
      basePlayer({
        id: 'player_001',
        vitals: {
          name: 'Kwame Asante',
          age: 20,
          position: 'ST',
          region: 'West Africa',
          nationality: 'Ghanaian',
        },
        progressLevel: 1,
        stats: { goals: 12, assists: 5, appearances: 25 },
        milestones: [
          createMilestone('ms_001', 'Scored hat-trick in regional final'),
        ],
      }),
      basePlayer({
        id: 'player_002',
        wallet: 'GDPF7BZSMAKLJYT4XSYVMAQGZ5LW3MV7KCXP5KBJDNNQJF5Z6VQL3FE',
        vitals: {
          name: 'Jonathan Alexander Christopher Maximilian von Habsburg-Lothringen III',
          age: 21,
          position: 'CB',
          region: 'Central Europe',
          nationality: 'Austrian',
        },
        progressLevel: 2,
        stats: { goals: 2, assists: 3, appearances: 40, clean_sheets: 12 },
        milestones: [
          createMilestone('ms_002', 'Defensive leader in youth league'),
          createMilestone('ms_003', 'Scouted by top European academy'),
        ],
      }),
    ],
  },
};

/** Narrow mobile viewport (360px) to test horizontal scrolling or stacking. */
export const MobileViewport: Story = {
  args: {
    players: [
      basePlayer({
        id: 'player_001',
        vitals: {
          name: 'Kwame Asante',
          age: 20,
          position: 'ST',
          region: 'West Africa',
          nationality: 'Ghanaian',
        },
        progressLevel: 1,
        stats: { goals: 12, assists: 5, appearances: 25 },
        milestones: [
          createMilestone('ms_001', 'Scored hat-trick in regional final'),
        ],
      }),
      basePlayer({
        id: 'player_002',
        wallet: 'GDPF7BZSMAKLJYT4XSYVMAQGZ5LW3MV7KCXP5KBJDNNQJF5Z6VQL3FE',
        vitals: {
          name: 'Amina Waweru',
          age: 18,
          position: 'GK',
          region: 'East Africa',
          nationality: 'Kenyan',
        },
        progressLevel: 2,
        stats: { goals: 0, assists: 0, appearances: 30, clean_sheets: 15 },
        milestones: [
          createMilestone('ms_002', 'Clean sheet in national championship'),
          createMilestone('ms_003', 'Called to U-20 national team'),
        ],
      }),
    ],
  },
  parameters: {
    viewport: {
      defaultViewport: 'iphone5',
    },
  },
};

// ── Best-value highlighting (issue #1721) ────────────────────────────────────

const tiePlayers: Player[] = [
  basePlayer({
    id: 'tie_001',
    vitals: { ...basePlayer({}).vitals, name: 'Kwame Asante' },
    progressLevel: 2,
    stats: { goals: 12, assists: 5, appearances: 30, clean_sheets: 0 },
  }),
  basePlayer({
    id: 'tie_002',
    vitals: { ...basePlayer({}).vitals, name: 'Amara Diallo', position: 'CM' },
    progressLevel: 2,
    stats: { goals: 12, assists: 9, appearances: 28 },
  }),
  basePlayer({
    id: 'tie_003',
    vitals: { ...basePlayer({}).vitals, name: 'Juma Mwangi', position: 'GK' },
    progressLevel: 1,
    stats: { goals: 0, assists: 1, appearances: 30, clean_sheets: 11 },
  }),
  basePlayer({
    id: 'tie_004',
    vitals: { ...basePlayer({}).vitals, name: 'Chidi Okafor', position: 'LW' },
    progressLevel: 3,
    stats: { goals: 7, assists: 9, appearances: 22 },
  }),
];

/** Two players tied on goals and progress level — both are marked best. */
export const TwoPlayersWithTies: Story = {
  args: { players: tiePlayers.slice(0, 2) },
};

/** Three players: tie on appearances, missing stats are never best. */
export const ThreePlayersWithTies: Story = {
  args: { players: tiePlayers.slice(0, 3) },
};

/** Four players: ties on assists, single leader on progress. */
export const FourPlayersWithTies: Story = {
  args: { players: tiePlayers },
};
