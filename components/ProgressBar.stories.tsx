import type { Meta, StoryObj } from '@storybook/react';
import type { ProgressLevel } from '@/types';
import ProgressBar from './ProgressBar';

const meta: Meta<typeof ProgressBar> = {
  title: 'Components/ProgressBar',
  component: ProgressBar,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const Unverified: Story = {
  args: {
    level: 0 as ProgressLevel,
  },
};

export const VerifiedIdentity: Story = {
  args: {
    level: 1 as ProgressLevel,
  },
};

export const Performance: Story = {
  args: {
    level: 2 as ProgressLevel,
  },
};

export const EliteTier: Story = {
  args: {
    level: 3 as ProgressLevel,
  },
};
