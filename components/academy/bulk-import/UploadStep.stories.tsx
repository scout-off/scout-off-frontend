import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import UploadStep from './UploadStep';

const meta: Meta<typeof UploadStep> = {
  title: 'Academy/BulkImport/UploadStep',
  component: UploadStep,
  args: { fileName: '', fileError: null, onFileChange: fn() },
};

export default meta;
type Story = StoryObj<typeof UploadStep>;

export const Empty: Story = {};

export const Loaded: Story = { args: { fileName: 'players.csv' } };

export const FileError: Story = {
  args: {
    fileError: { code: 'TOO_MANY_ROWS', params: { count: 612, max: 500 } },
  },
};

export const Disabled: Story = {
  args: { fileName: 'players.csv', disabled: true },
};
