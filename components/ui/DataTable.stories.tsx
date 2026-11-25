import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from '@storybook/test';
import DataTable, { type DataTableColumn } from './DataTable';

interface FlagRow {
  id: string;
  wallet: string;
  severity: number;
  createdAt: number;
}

const rows: FlagRow[] = [
  { id: '1', wallet: 'GBETA', severity: 2, createdAt: 1_700_000_300 },
  { id: '2', wallet: 'GALPHA', severity: 5, createdAt: 1_700_000_100 },
  { id: '3', wallet: 'Gcharlie', severity: 2, createdAt: 1_700_000_200 },
];

const columns: DataTableColumn<FlagRow>[] = [
  {
    key: 'wallet',
    header: 'Wallet',
    sortable: true,
    render: (r) => <span className="font-mono">{r.wallet}</span>,
  },
  {
    key: 'severity',
    header: 'Severity',
    sortable: true,
    render: (r) => r.severity,
  },
  {
    key: 'createdAt',
    header: 'Created',
    sortable: true,
    sortValue: (r) => new Date(r.createdAt * 1000),
    render: (r) => new Date(r.createdAt * 1000).toISOString(),
  },
  { key: 'note', header: 'Note', render: () => '—' },
];

const meta: Meta<typeof DataTable<FlagRow>> = {
  title: 'UI/DataTable',
  component: DataTable,
  tags: ['autodocs'],
  args: {
    columns,
    rows,
    rowKey: (r: FlagRow) => r.id,
    caption: 'Fraud flags',
    sortParam: 'storySort',
  },
};

export default meta;
type Story = StoryObj<typeof DataTable<FlagRow>>;

export const Default: Story = {};

export const InitiallySorted: Story = {
  args: { initialSort: { key: 'createdAt', direction: 'desc' } },
};

/** Keyboard sort with an axe check (the test runner runs axe on play stories). */
export const KeyboardSort: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const header = canvas.getByRole('columnheader', { name: /severity/i });
    await expect(header).toHaveAttribute('aria-sort', 'none');
    canvas.getByRole('button', { name: /severity/i }).focus();
    await userEvent.keyboard('{Enter}');
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.keyboard('{Enter}');
    await expect(header).toHaveAttribute('aria-sort', 'descending');
  },
};
