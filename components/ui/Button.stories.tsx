import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import Button from './Button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  args: { onClick: fn() },
  argTypes: {
    variant: { control: 'radio', options: ['default', 'danger', 'secondary'] },
    isLoading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: { children: 'Connect Wallet', variant: 'default' },
};

export const Danger: Story = {
  args: { children: 'Delete Player', variant: 'danger' },
};

export const Secondary: Story = {
  args: { children: 'Cancel', variant: 'secondary' },
};

export const Loading: Story = {
  args: { children: 'Signing…', variant: 'default', isLoading: true },
};

export const Disabled: Story = {
  args: { children: 'Submit', variant: 'default', disabled: true },
};

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="default">Default</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="default" isLoading>
        Loading
      </Button>
      <Button variant="default" disabled>
        Disabled
      </Button>
    </div>
  ),
};
