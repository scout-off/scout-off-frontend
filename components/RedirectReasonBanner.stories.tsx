import type { Meta, StoryObj } from '@storybook/react';
import RedirectReasonBanner from './ui/RedirectReasonBanner';

const meta: Meta<typeof RedirectReasonBanner> = {
  title: 'Components/RedirectReasonBanner',
  component: RedirectReasonBanner,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof RedirectReasonBanner>;

export const WalletRequired: Story = {
  args: {
    reason: 'wallet-required',
  },
};

export const SubscriptionExpired: Story = {
  args: {
    reason: 'subscription-expired',
  },
};

export const NoReason: Story = {
  args: {
    reason: null,
  },
};
