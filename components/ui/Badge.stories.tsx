import type { Meta, StoryObj } from '@storybook/react';
import Badge from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['level0', 'level1', 'level2', 'level3', 'position', 'region'],
    },
    size: { control: 'radio', options: ['sm', 'md'] },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { variant: 'level0', label: 'Rookie', size: 'sm' },
};

export const Level1: Story = {
  args: { variant: 'level1', label: 'Amateur', size: 'sm' },
};

export const Level2: Story = {
  args: { variant: 'level2', label: 'Semi-Pro', size: 'sm' },
};

export const Level3: Story = {
  args: { variant: 'level3', label: 'Professional', size: 'sm' },
};

export const Position: Story = {
  args: { variant: 'position', label: 'Forward', size: 'sm' },
};

export const Region: Story = {
  args: { variant: 'region', label: 'West Africa', size: 'sm' },
};

export const SizeMd: Story = {
  name: 'Size: md',
  args: { variant: 'level3', label: 'Professional', size: 'md' },
};

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div className="flex flex-wrap gap-3">
      {(
        ['level0', 'level1', 'level2', 'level3', 'position', 'region'] as const
      ).map((v) => (
        <Badge key={v} variant={v} label={v} size="md" />
      ))}
    </div>
  ),
};
