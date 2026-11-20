import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import Textarea, { type TextareaProps } from './Textarea';

const meta: Meta<typeof Textarea> = {
  title: 'UI/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    error: { control: 'text' },
    hint: { control: 'text' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

function ControlledTextarea(props: TextareaProps) {
  const [value, setValue] = useState('');
  return (
    <Textarea
      {...props}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

export const Default: Story = {
  args: {
    label: 'Bio',
    rows: 3,
    placeholder: 'Tell us about yourself',
  },
};

export const WithHint: Story = {
  args: {
    label: 'Milestone Description',
    hint: "Describe the player's achievement in a sentence or two.",
    rows: 3,
  },
};

export const WithError: Story = {
  args: {
    label: 'Milestone Description',
    defaultValue: '',
    error: 'A description is required.',
    rows: 3,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Bio',
    defaultValue: 'Left-footed winger from Accra.',
    disabled: true,
    rows: 3,
  },
};

export const WithCharacterCounter: Story = {
  name: 'With Character Counter',
  render: (args) => <ControlledTextarea {...args} />,
  args: {
    label: 'Note',
    maxLength: 200,
    rows: 3,
  },
};
