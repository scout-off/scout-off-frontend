import type { Meta, StoryObj } from '@storybook/react';
import Tooltip from './Tooltip';
import Badge from './Badge';

const meta: Meta<typeof Tooltip> = {
  title: 'UI/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  argTypes: {
    content: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  args: {
    content: 'Hover or focus to see this tooltip',
    children: <span className="text-brand-green underline cursor-help">Hover me</span>,
  },
};

export const OnBadge: Story = {
  name: 'Wrapping a Badge',
  render: () => (
    <Tooltip content="This player has reached the professional tier">
      <Badge variant="level3" label="Professional" size="md" />
    </Tooltip>
  ),
};

export const LongContent: Story = {
  name: 'Long Tooltip Content',
  render: () => (
    <Tooltip content="Scouts can contact this player directly after purchasing a pay-to-contact token. The fee goes to the platform treasury and is non-refundable.">
      <span className="text-gray-400 underline cursor-help text-sm">
        What does pay-to-contact mean?
      </span>
    </Tooltip>
  ),
};

export const BottomFlip: Story = {
  name: 'Near Top of Viewport (flips below)',
  parameters: { layout: 'padded' },
  render: () => (
    <div style={{ paddingTop: '0px' }}>
      <Tooltip content="Tooltip flips below when near the top of the viewport">
        <span className="text-gray-400 underline cursor-help text-sm">Near top</span>
      </Tooltip>
    </div>
  ),
};
