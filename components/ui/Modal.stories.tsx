import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';

const meta: Meta<typeof Modal> = {
  title: 'UI/Modal',
  component: Modal,
  tags: ['autodocs'],
  args: { onClose: fn() },
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof Modal>;

export const Open: Story = {
  args: {
    isOpen: true,
    children: <p className="text-gray-300">Modal body content goes here.</p>,
  },
};

export const WithTitle: Story = {
  args: {
    isOpen: true,
    title: 'Confirm Action',
    children: <p className="text-gray-300">Are you sure you want to proceed?</p>,
  },
};

export const Closed: Story = {
  args: {
    isOpen: false,
    title: 'Hidden Modal',
    children: <p className="text-gray-300">This should not be visible.</p>,
  },
};

export const WithInteraction: Story = {
  name: 'Interactive (open/close)',
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div className="p-8">
        <Button onClick={() => setOpen(true)}>Open Modal</Button>
        <Modal isOpen={open} onClose={() => setOpen(false)} title="Interactive Modal">
          <p className="text-gray-300 mb-4">Press Escape or click outside to close.</p>
          <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
        </Modal>
      </div>
    );
  },
};
