import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import Button from './Button';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  args: { onConfirm: fn(), onCancel: fn() },
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const Default: Story = {
  args: {
    isOpen: true,
    title: 'Remove Validator',
    message:
      'Are you sure you want to remove this validator? This action cannot be undone.',
  },
};

export const WithCustomLabels: Story = {
  args: {
    isOpen: true,
    title: 'Pause Contract',
    message:
      'Pausing the contract will disable all write operations for all users. Continue?',
    confirmLabel: 'Yes, Pause',
    cancelLabel: 'Keep Active',
  },
};

export const Loading: Story = {
  args: {
    isOpen: true,
    title: 'Confirm Withdrawal',
    message: 'Withdraw all accumulated platform fees to the admin wallet?',
    loading: true,
  },
};

export const Interactive: Story = {
  name: 'Interactive (open/close)',
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);
      const [loading, setLoading] = useState(false);

      const handleConfirm = async () => {
        setLoading(true);
        await new Promise((r) => setTimeout(r, 1500));
        setLoading(false);
        setOpen(false);
      };

      return (
        <div className="p-8">
          <Button variant="danger" onClick={() => setOpen(true)}>
            Remove Validator
          </Button>
          <ConfirmDialog
            isOpen={open}
            onConfirm={handleConfirm}
            onCancel={() => setOpen(false)}
            title="Remove Validator"
            message="This will permanently revoke this wallet's validator privileges on-chain."
            confirmLabel="Remove"
            loading={loading}
          />
        </div>
      );
    }
    return <Demo />;
  },
};
