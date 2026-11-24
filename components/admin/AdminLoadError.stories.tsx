import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import AdminLoadError from './AdminLoadError';

const meta: Meta<typeof AdminLoadError> = {
  title: 'Components/Admin/AdminLoadError',
  component: AdminLoadError,
  tags: ['autodocs'],
  args: {
    onRetry: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AdminLoadError>;

export const GenericError: Story = {};

// The component has a single copy for every failure, so a non-admin (403)
// response renders the same message; this story documents that case.
export const Forbidden: Story = {};

export const WithRetry: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};
