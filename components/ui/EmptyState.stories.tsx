import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import EmptyState from './EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'UI/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: { title: 'No Players Found' },
};

export const WithDescription: Story = {
  args: {
    title: 'No Players Found',
    description: 'No players match your current filters. Try adjusting your region or position criteria.',
  },
};

export const WithAction: Story = {
  args: {
    title: 'No Subscription Yet',
    description: 'Subscribe to a plan to unlock player contact details and advanced search filters.',
    action: { label: 'Subscribe Now', onClick: fn() },
  },
};

export const WithCustomIcon: Story = {
  args: {
    title: 'Wallet Not Connected',
    description: 'Connect your Stellar wallet to access the scouting platform.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-12 h-12 mx-auto text-gray-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
        />
      </svg>
    ),
    action: { label: 'Connect Wallet', onClick: fn() },
  },
};
