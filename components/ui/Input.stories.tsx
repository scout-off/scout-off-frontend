import type { Meta, StoryObj } from '@storybook/react';
import Input from './Input';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    error: { control: 'text' },
    hint: { control: 'text' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: {
    id: 'player-name',
    label: 'Player Name',
    placeholder: 'e.g. Jordan Smith',
  },
};

export const WithHint: Story = {
  args: {
    id: 'wallet-address',
    label: 'Wallet Address',
    hint: 'The Stellar public key that will receive contact requests.',
  },
};

export const WithError: Story = {
  args: {
    id: 'email',
    label: 'Email',
    defaultValue: 'not-an-email',
    error: 'Please enter a valid email address.',
  },
};

export const Disabled: Story = {
  args: {
    id: 'locked-field',
    label: 'Player ID',
    defaultValue: 'PLR-10492',
    disabled: true,
  },
};
