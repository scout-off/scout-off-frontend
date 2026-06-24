import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ToastProvider, useToast } from './Toast';
import Button from './Button';

const meta: Meta = {
  title: 'UI/Toast',
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

function ToastTrigger({ variant, message }: { variant: 'success' | 'error' | 'info' | 'warning'; message: string }) {
  const { show } = useToast();
  return (
    <Button onClick={() => show({ message, variant })}>
      Show {variant} toast
    </Button>
  );
}

export const Success: Story = {
  render: () => <ToastTrigger variant="success" message="Player registered successfully." />,
};

export const Error: Story = {
  render: () => <ToastTrigger variant="error" message="Transaction failed. Please try again." />,
};

export const Info: Story = {
  render: () => <ToastTrigger variant="info" message="Your subscription expires in 3 days." />,
};

export const Warning: Story = {
  render: () => <ToastTrigger variant="warning" message="Insufficient XLM balance for this action." />,
};

export const AllVariants: Story = {
  name: 'All Variants (trigger all)',
  render: () => {
    const { show } = useToast();
    return (
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => show({ message: 'Player registered.', variant: 'success' })}>
          Success
        </Button>
        <Button variant="danger" onClick={() => show({ message: 'Transaction failed.', variant: 'error' })}>
          Error
        </Button>
        <Button variant="secondary" onClick={() => show({ message: 'Subscription expires soon.', variant: 'info' })}>
          Info
        </Button>
        <Button variant="secondary" onClick={() => show({ message: 'Low XLM balance.', variant: 'warning' })}>
          Warning
        </Button>
      </div>
    );
  },
};
