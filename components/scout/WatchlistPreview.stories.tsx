import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import WatchlistPreview from './WatchlistPreview';
import type { WatchlistEntry } from '@/types';

// WatchlistPreview is purely prop-driven (the dashboard passes it the result
// of useWatchlist), so stories inject fixture entries directly.

function makeEntries(count: number): WatchlistEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    scoutWallet: 'GSCOUTEXAMPLEWALLETADDRESS',
    playerId: `player_${String(i + 1).padStart(3, '0')}`,
    createdAt: 1_767_225_600_000 + i * 86_400_000,
  }));
}

const meta: Meta<typeof WatchlistPreview> = {
  title: 'Components/Scout/WatchlistPreview',
  component: WatchlistPreview,
  tags: ['autodocs'],
  args: { onRemove: fn() },
};
export default meta;
type Story = StoryObj<typeof WatchlistPreview>;

/** The component renders nothing for an empty watchlist. */
export const Empty: Story = {
  args: { entries: [] },
};

export const FewPlayers: Story = {
  args: { entries: makeEntries(3) },
};

/** Only the first five entries are shown; "View all" links to the full list. */
export const ManyPlayers: Story = {
  args: { entries: makeEntries(12) },
};

/**
 * WatchlistPreview has no loading state of its own: while useWatchlist is
 * loading the dashboard passes an empty list, so it renders nothing.
 */
export const Loading: Story = {
  args: { entries: [] },
};
