import type { Meta, StoryObj } from '@storybook/react';
import ReviewStep from './ReviewStep';
import { sampleRows } from './fixtures';

const meta: Meta<typeof ReviewStep> = {
  title: 'Academy/BulkImport/ReviewStep',
  component: ReviewStep,
  args: {
    phase: 'preview',
    rows: sampleRows,
    submissions: {},
    validCount: 4,
    invalidCount: 1,
    resumedSessionInfo: null,
  },
};

export default meta;
type Story = StoryObj<typeof ReviewStep>;

export const Preview: Story = {};

export const ResumedSession: Story = {
  args: {
    submissions: { 1: { status: 'success', txHash: 'abc123' } },
    resumedSessionInfo: { completedRows: 1, totalRows: 4 },
  },
};

export const Importing: Story = {
  args: {
    phase: 'submitting',
    submissions: {
      1: { status: 'success', txHash: 'abc123' },
      2: { status: 'failed', error: 'Transaction rejected by wallet' },
      4: { status: 'signing' },
      5: { status: 'pending' },
    },
  },
};
