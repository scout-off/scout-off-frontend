import type { Meta, StoryObj } from '@storybook/react';
import SubscriptionStatusBanner from './SubscriptionStatusBanner';
import type { Subscription } from '@/types';

// Date.now() is pinned so days-remaining output is stable across runs.
const FIXED_NOW_MS = Date.UTC(2026, 2, 15, 12, 0, 0);
const DAY_S = 86_400;

function subscription(
  tier: Subscription['tier'],
  daysFromNow: number,
): Subscription {
  return {
    scout: 'GSCOUTEXAMPLEWALLETADDRESS',
    tier,
    // Half a day of slack so Math.floor lands on `daysFromNow`.
    expiresAt: FIXED_NOW_MS / 1000 + daysFromNow * DAY_S + DAY_S / 2,
  };
}

const meta: Meta<typeof SubscriptionStatusBanner> = {
  title: 'Components/Scout/SubscriptionStatusBanner',
  component: SubscriptionStatusBanner,
  tags: ['autodocs'],
  beforeEach: () => {
    const realNow = Date.now;
    Date.now = () => FIXED_NOW_MS;
    return () => {
      Date.now = realNow;
    };
  },
};
export default meta;
type Story = StoryObj<typeof SubscriptionStatusBanner>;

export const Active: Story = {
  args: { subscription: subscription('pro', 30) },
};

export const ExpiringSoon: Story = {
  args: { subscription: subscription('pro', 3) },
};

export const Expired: Story = {
  args: { subscription: subscription('pro', -2) },
};

/**
 * There is no dedicated trial tier; a trial is the entry `basic` tier with a
 * short window, which renders in the expiring-soon style.
 */
export const Trial: Story = {
  args: { subscription: subscription('basic', 7) },
};
