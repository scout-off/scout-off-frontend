import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import ImportProgress from './ImportProgress';

const meta: Meta<typeof ImportProgress> = {
  title: 'Academy/BulkImport/ImportProgress',
  component: ImportProgress,
  args: {
    phase: 'preview',
    isPausedBatch: false,
    validCount: 4,
    doneCount: 0,
    hasWallet: true,
    contractPaused: false,
    onImport: fn(),
    onPause: fn(),
    onResume: fn(),
    onCancel: fn(),
    onReset: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof ImportProgress>;

export const Ready: Story = {};

export const NoWallet: Story = { args: { hasWallet: false } };

export const Importing: Story = {
  args: { phase: 'submitting', doneCount: 2 },
};

export const Paused: Story = {
  args: { phase: 'submitting', doneCount: 2, isPausedBatch: true },
};

export const Done: Story = { args: { phase: 'done', doneCount: 4 } };
