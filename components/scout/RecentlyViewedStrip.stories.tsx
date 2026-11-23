import type { Meta, StoryObj } from '@storybook/react';
import RecentlyViewedStrip from './RecentlyViewedStrip';
import type { RecentlyViewedEntry } from '@/types';

const POSITIONS = ['Forward', 'Midfielder', 'Defender', 'Goalkeeper'];

// The strip takes its entries as props (the dashboard feeds it from
// hooks/useRecentlyViewed.ts), so stories inject fixed entries directly.
function makeEntries(count: number): RecentlyViewedEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    playerId: `player-${i + 1}`,
    name: `Player ${i + 1}`,
    position: POSITIONS[i % POSITIONS.length],
    viewedAt: Date.UTC(2026, 0, 1) - i * 60_000,
  }));
}

const meta: Meta<typeof RecentlyViewedStrip> = {
  title: 'Components/Scout/RecentlyViewedStrip',
  component: RecentlyViewedStrip,
  tags: ['autodocs'],
  // The component renders nothing when empty; keep a wrapper mounted so the
  // story root is never blank.
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof RecentlyViewedStrip>;

export const Empty: Story = {
  args: { entries: [] },
};

export const ThreePlayers: Story = {
  args: { entries: makeEntries(3) },
};

export const TenOrMorePlayers: Story = {
  args: { entries: makeEntries(12) },
};
