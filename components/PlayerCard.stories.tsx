import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import PlayerCard from './PlayerCard';
import type { Player } from '@/types';

const meta: Meta<typeof PlayerCard> = {
  title: 'Components/PlayerCard',
  component: PlayerCard,
  tags: ['autodocs'],
  args: {
    onToggleWatchlist: fn(),
  },
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
type Story = StoryObj<typeof PlayerCard>;

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

// ── Stories ───────────────────────────────────────────────────────────────────

/** Level 0 — player profile created but not yet verified. */
export const UnverifiedPlayer: Story = {
  args: {
    player: basePlayer({
      id: 'player_001',
      wallet: 'GBKR6LYRKEFYV3MG322FYLED6PLOTEV77KCX6AZSR7V4RV7EJLIWOZJW',
      vitals: {
        name: 'Kwame Asante',
        age: 20,
        position: 'ST',
        region: 'West Africa',
        nationality: 'Ghanaian',
      },
      progressLevel: 0,
      milestones: [],
    }),
    isWatched: false,
  },
};

/** Level 1 — identity verified by an academy or KYC. */
export const VerifiedIdentity: Story = {
  args: {
    player: basePlayer({
      id: 'player_002',
      wallet: 'GDPF7BZSMAKLJYT4XSYVMAQGZ5LW3MV7KCXP5KBJDNNQJF5Z6VQL3FE',
      vitals: {
        name: 'Amina Waweru',
        age: 18,
        position: 'GK',
        region: 'East Africa',
        nationality: 'Kenyan',
      },
      progressLevel: 1,
      milestones: [],
      stats: { goals: 0, assists: 0, appearances: 12, clean_sheets: 7 },
    }),
    isWatched: false,
  },
};

/** Level 2 — at least one validator-approved performance milestone. */
export const PerformanceMilestones: Story = {
  args: {
    player: basePlayer({
      id: 'player_003',
      wallet: 'GCZE3GXSNZV7JDXM5YVAQXRPZULBGZ5W3TKKD4MZGV7QJRFWU6A7OLP',
      vitals: {
        name: 'Emeka Okafor',
        age: 22,
        position: 'CAM',
        region: 'West Africa',
        nationality: 'Nigerian',
      },
      progressLevel: 2,
      milestones: [
        {
          id: 'ms_001',
          description: 'Scored 5 goals in the Lagos State League Cup',
          evidenceHash: 'QmXyz123',
          validator: 'GBVALIADDR1111111111111111111111111111111111111111111111',
          timestamp: 1_700_100_000,
        },
        {
          id: 'ms_002',
          description: 'Named Player of the Tournament at WAFU U-20 trials',
          evidenceHash: 'QmAbc456',
          validator: 'GBVALIADDR1111111111111111111111111111111111111111111111',
          timestamp: 1_700_200_000,
        },
      ],
    }),
    isWatched: true,
  },
};

/** Level 3 — scout has logged a trial offer, reaching Elite Tier. */
export const EliteTier: Story = {
  args: {
    player: basePlayer({
      id: 'player_004',
      wallet: 'GDRK7XPMQKFM5WT3YCNZPF4YLGMSWTVN5FCNLSDJHQZEBGR4K6YZXPN',
      vitals: {
        name: 'Fatou Diallo',
        age: 19,
        position: 'LW',
        region: 'West Africa',
        nationality: 'Senegalese',
      },
      progressLevel: 3,
      milestones: [
        {
          id: 'ms_003',
          description: 'Top scorer in Dakar Regional League',
          evidenceHash: 'QmDef789',
          validator: 'GBVALIADDR2222222222222222222222222222222222222222222222',
          timestamp: 1_700_300_000,
        },
        {
          id: 'ms_004',
          description: 'Selected for CAF Youth Development Programme',
          evidenceHash: 'QmGhi012',
          validator: 'GBVALIADDR2222222222222222222222222222222222222222222222',
          timestamp: 1_700_400_000,
        },
      ],
    }),
    isWatched: true,
  },
};

/** Archived player — hidden from active scout searches. */
export const ArchivedPlayer: Story = {
  args: {
    player: basePlayer({
      id: 'player_005',
      wallet: 'GAVX5PQVNLBK3RTJDZMZE5T3QZLFH7YWCZSQ4YNLPCBP4TQVJX6EKZM',
      vitals: {
        name: 'Tendai Moyo',
        age: 24,
        position: 'CB',
        region: 'Southern Africa',
        nationality: 'Zimbabwean',
      },
      progressLevel: 0,
      milestones: [],
      archived: true,
    }),
    isWatched: false,
    onToggleWatchlist: undefined,
  },
};
