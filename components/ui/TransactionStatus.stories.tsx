import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { useState } from 'react';
import TransactionStatus from './TransactionStatus';
import Button from './Button';

const meta: Meta<typeof TransactionStatus> = {
  title: 'UI/TransactionStatus',
  component: TransactionStatus,
  tags: ['autodocs'],
  args: { onHide: fn() },
};

export default meta;
type Story = StoryObj<typeof TransactionStatus>;

export const Pending: Story = {
  args: { status: 'pending' },
};

export const Success: Story = {
  args: { status: 'success', autoHideMs: 99999 },
};

export const SuccessWithExplorerLink: Story = {
  name: 'Success with Explorer Link',
  args: {
    status: 'success',
    txHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    autoHideMs: 99999,
  },
};

export const Error: Story = {
  args: {
    status: 'error',
    error: 'Transaction failed: insufficient XLM balance.',
  },
};

export const ErrorDefault: Story = {
  name: 'Error (default message)',
  args: { status: 'error' },
};

export const Hidden: Story = {
  args: { status: null },
};

export const AllStates: Story = {
  name: 'All States',
  render: () => (
    <div className="flex flex-col gap-4 max-w-lg">
      <TransactionStatus status="pending" />
      <TransactionStatus status="success" autoHideMs={99999} />
      <TransactionStatus
        status="success"
        txHash="abc123def456abc123def456abc123def456abc123def456abc123def456abc123"
        autoHideMs={99999}
      />
      <TransactionStatus
        status="error"
        error="Contract error: subscription expired (code 8)."
      />
    </div>
  ),
};

export const Interactive: Story = {
  name: 'Interactive Flow',
  render: () => {
    function Demo() {
      const [status, setStatus] = useState<
        'pending' | 'success' | 'error' | null
      >(null);

      const simulate = async (outcome: 'success' | 'error') => {
        setStatus('pending');
        await new Promise((r) => setTimeout(r, 1500));
        setStatus(outcome);
      };

      return (
        <div className="flex flex-col gap-4 max-w-lg">
          <div className="flex gap-3">
            <Button onClick={() => simulate('success')}>
              Simulate Success
            </Button>
            <Button variant="danger" onClick={() => simulate('error')}>
              Simulate Error
            </Button>
            <Button variant="secondary" onClick={() => setStatus(null)}>
              Reset
            </Button>
          </div>
          <TransactionStatus status={status} onHide={() => setStatus(null)} />
        </div>
      );
    }
    return <Demo />;
  },
};
