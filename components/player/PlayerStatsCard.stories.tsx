import type { Meta, StoryObj } from '@storybook/react';
import PlayerStatsCard from './PlayerStatsCard';

const meta: Meta<typeof PlayerStatsCard> = {
  title: 'Components/Player/PlayerStatsCard',
  component: PlayerStatsCard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PlayerStatsCard>;

// Mirrors the goalkeeper fixture in PlayerCard.stories.tsx.
export const FullStats: Story = {
  args: {
    position: 'GK',
    stats: { goals: 0, assists: 0, appearances: 12, clean_sheets: 7 },
  },
};

export const OutfieldPlayer: Story = {
  args: {
    position: 'FW',
    stats: { goals: 14, assists: 6, appearances: 22 },
  },
};

export const PartialStats: Story = {
  args: {
    position: 'GK',
    stats: { goals: 0, assists: 1, appearances: 3 },
  },
};

export const Loading: Story = {
  args: {
    position: 'GK',
    stats: undefined,
  },
};
