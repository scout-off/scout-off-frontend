import type { Meta, StoryObj } from '@storybook/react';
import AchievementBadges from './AchievementBadges';
import { BADGE_DEFINITIONS } from '@/lib/badges';
import type { Player } from '@/types';

const basePlayer = {
  id: 'story-player',
  vitals: {
    name: 'Amara Okafor',
    position: 'Midfielder',
    region: 'Lagos',
    nationality: 'Nigeria',
    age: 19,
  },
  ipfsHash: 'QmStoryFixtureHash',
  stats: { goals: 12, assists: 8, matches: 30 },
  wallet: 'GSTORYFIXTUREWALLET',
  milestones: [],
  progressLevel: 0,
  createdAt: 0,
} as unknown as Player;

const milestones = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i}` })) as unknown as Player['milestones'];

const meta: Meta<typeof AchievementBadges> = {
  title: 'Components/Player/AchievementBadges',
  component: AchievementBadges,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof AchievementBadges>;

/** Player with no earned badges: the component renders nothing. */
export const NoBadges: Story = {
  args: {
    player: {
      ...basePlayer,
      vitals: { ...basePlayer.vitals, name: '' },
      stats: undefined,
    } as unknown as Player,
  },
};

export const OneBadge: Story = {
  args: {
    player: { ...basePlayer, vitals: { ...basePlayer.vitals, name: '' }, stats: undefined, milestones: milestones(1) } as unknown as Player,
  },
};

export const AllBadges: Story = {
  args: {
    player: { ...basePlayer, milestones: milestones(10), progressLevel: 3 } as unknown as Player,
  },
  parameters: {
    docs: {
      description: {
        story: `Badges defined in lib/badges.ts: ${Object.values(BADGE_DEFINITIONS)
          .map((b) => b.label)
          .join(', ')}.`,
      },
    },
  },
};
