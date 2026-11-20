import type { Meta, StoryObj } from '@storybook/react';
import DataTable, { type DataTableColumn } from './DataTable';

interface FlagRow {
  id: string;
  wallet: string;
  severity: number;
  createdAt: number;
}

const rows: FlagRow[] = [
  { id: 'f1', wallet: 'GBKR…OZJW', severity: 3, createdAt: 1_730_000_000 },
  { id: 'f2', wallet: 'GDPF…L3FE', severity: 1, createdAt: 1_731_000_000 },
  { id: 'f3', wallet: 'GAZX…Q2PL', severity: 2, createdAt: 1_729_000_000 },
];

const columns: DataTableColumn<FlagRow>[] = [
  {
    key: 'createdAt',
    header: 'Created',
    sortable: true,
    render: (r) => new Date(r.createdAt * 1000).toISOString().slice(0, 10),
  },
  { key: 'wallet', header: 'Wallet', sortable: true, render: (r) => r.wallet },
  {
    key: 'severity',
    header: 'Severity',
    sortable: true,
    render: (r) => r.severity,
  },
  { key: 'notes', header: 'Notes', render: () => '—' },
];

// Axe runs against every story via .storybook/test-runner.ts.
const meta: Meta<typeof DataTable<FlagRow>> = {
  title: 'UI/DataTable',
  component: DataTable,
  tags: ['autodocs'],
  args: {
    caption: 'Fraud flags',
    columns,
    rows,
    rowKey: (r: FlagRow) => r.id,
  },
};

export default meta;
type Story = StoryObj<typeof DataTable<FlagRow>>;

export const Default: Story = {};

export const InitiallySorted: Story = {
  args: { initialSort: { key: 'severity', direction: 'desc' } },
};

export const HiddenCaption: Story = {
  args: { captionHidden: true },
};

export const SortingDisabled: Story = {
  args: { sortingEnabled: false },
};
