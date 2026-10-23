import type { Meta, StoryObj } from '@storybook/react';
import { SWRConfig } from 'swr';
import DataFreshnessBadge from './DataFreshnessBadge';
import {
  markPendingIndexerWrite,
  resetPendingIndexerWrite,
  type IndexerFreshness,
} from '@/hooks/useIndexerFreshness';

// useIndexerFreshness reads `/api/indexer/health` through SWR. Seeding the
// key via `fallback` with fetching paused gives each story a fixed lag
// value without network access.
function withFreshness(data: IndexerFreshness) {
  function FreshnessDecorator(Story: React.ComponentType) {
    return (
      <SWRConfig
        value={{
          provider: () => new Map(),
          isPaused: () => true,
          fallback: { '/api/indexer/health': data },
        }}
      >
        <Story />
      </SWRConfig>
    );
  }
  return FreshnessDecorator;
}

const meta: Meta<typeof DataFreshnessBadge> = {
  title: 'Components/Ui/DataFreshnessBadge',
  component: DataFreshnessBadge,
  tags: ['autodocs'],
  beforeEach: () => {
    resetPendingIndexerWrite();
    return resetPendingIndexerWrite;
  },
};
export default meta;
type Story = StoryObj<typeof DataFreshnessBadge>;

export const Fresh: Story = {
  decorators: [
    withFreshness({
      lastLedger: 1000,
      lastUpdated: Date.now() - 30_000,
      ledgerLag: 2,
    }),
  ],
};

export const SlightlyStale: Story = {
  decorators: [
    withFreshness({
      lastLedger: 1000,
      lastUpdated: Date.now() - 4 * 60_000,
      ledgerLag: 40,
    }),
  ],
};

export const IndexerLagging: Story = {
  decorators: [
    withFreshness({
      lastLedger: 1000,
      lastUpdated: Date.now() - 30 * 60_000,
      ledgerLag: 350,
    }),
  ],
};

export const PendingWrite: Story = {
  beforeEach: () => {
    markPendingIndexerWrite(1005);
  },
  decorators: [
    withFreshness({
      lastLedger: 1000,
      lastUpdated: Date.now() - 30_000,
      ledgerLag: 2,
    }),
  ],
};
