import type { Meta, StoryObj } from '@storybook/react';
import ImportSummary from './ImportSummary';

const meta: Meta<typeof ImportSummary> = {
  title: 'Academy/BulkImport/ImportSummary',
  component: ImportSummary,
  args: { succeeded: 4, failed: 0, invalid: 0 },
};

export default meta;
type Story = StoryObj<typeof ImportSummary>;

export const AllSucceeded: Story = {};

export const PartialFailure: Story = {
  args: { succeeded: 3, failed: 1, invalid: 1 },
};
