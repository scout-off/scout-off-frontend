import type { Meta, StoryObj } from '@storybook/react';
import Spinner from './Spinner';

const meta: Meta<typeof Spinner> = {
  title: 'UI/Spinner',
  component: Spinner,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'radio', options: ['sm', 'md', 'lg'] },
  },
};

export default meta;
type Story = StoryObj<typeof Spinner>;

export const Small: Story = { args: { size: 'sm' } };
export const Medium: Story = { args: { size: 'md' } };
export const Large: Story = { args: { size: 'lg' } };

export const AllSizes: Story = {
  name: 'All Sizes',
  render: () => (
    <div className="flex items-center gap-8 text-white">
      <div className="flex flex-col items-center gap-2">
        <Spinner size="sm" />
        <span className="text-xs text-gray-400">sm</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="md" />
        <span className="text-xs text-gray-400">md</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" />
        <span className="text-xs text-gray-400">lg</span>
      </div>
    </div>
  ),
};
