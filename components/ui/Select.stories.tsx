import type { Meta, StoryObj } from '@storybook/react';
import Select from './Select';

const meta: Meta<typeof Select> = {
  title: 'UI/Select',
  component: Select,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    error: { control: 'text' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Select>;

const Options = () => (
  <>
    <option value="">Select a tier…</option>
    <option value="basic">Basic — 10 XLM / month</option>
    <option value="pro">Pro — 25 XLM / month</option>
    <option value="elite">Elite — 50 XLM / month</option>
  </>
);

export const Default: Story = {
  render: () => <Select><Options /></Select>,
};

export const WithLabel: Story = {
  render: () => (
    <Select label="Subscription Tier">
      <Options />
    </Select>
  ),
};

export const WithError: Story = {
  render: () => (
    <Select label="Subscription Tier" error="Please select a tier to continue.">
      <Options />
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select label="Subscription Tier" disabled>
      <Options />
    </Select>
  ),
};

export const WithPreselected: Story = {
  name: 'With Pre-selected Value',
  render: () => (
    <Select label="Subscription Tier" defaultValue="pro">
      <Options />
    </Select>
  ),
};
