import type { Meta, StoryObj } from '@storybook/react';
import SpendingSummary from './SpendingSummary';
import { setMockSpendingSummary } from '../../.storybook/mocks/spending-hooks';
import type { SpendingSummaryData } from '@/hooks/useSpendingSummary';

// useSpendingSummary / useFeeDriftDetection are aliased to
// .storybook/mocks/spending-hooks.ts; each story sets the hook state in
// beforeEach. window.fetch is stubbed so the fiat rate (XlmFiatDisplay) and
// indexer freshness badge render without network access.

const XLM_USD_RATE = 0.12;

const LOADED: SpendingSummaryData = {
  totalContactFeesXlm: 150,
  totalSubscriptionsXlm: 300,
  totalXlm: 450,
  monthlyBreakdown: [
    {
      monthKey: '2026-03',
      label: 'Mar 2026',
      contactFeeXlm: 50,
      subscriptionXlm: 100,
      totalXlm: 150,
    },
    {
      monthKey: '2026-02',
      label: 'Feb 2026',
      contactFeeXlm: 0,
      subscriptionXlm: 0,
      totalXlm: 0,
    },
    {
      monthKey: '2026-01',
      label: 'Jan 2026',
      contactFeeXlm: 100,
      subscriptionXlm: 200,
      totalXlm: 300,
    },
  ],
};

const EMPTY: SpendingSummaryData = {
  totalContactFeesXlm: 0,
  totalSubscriptionsXlm: 0,
  totalXlm: 0,
  monthlyBreakdown: [],
};

const meta: Meta<typeof SpendingSummary> = {
  title: 'Components/Scout/SpendingSummary',
  component: SpendingSummary,
  tags: ['autodocs'],
  beforeEach: () => {
    const realFetch = window.fetch;
    window.fetch = async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('/api/rates/xlm')) {
        return Response.json({
          rate: XLM_USD_RATE,
          updatedAt: '2026-03-15T12:00:00.000Z',
          stale: false,
          source: 'storybook',
        });
      }
      return new Response(null, { status: 503 });
    };
    return () => {
      window.fetch = realFetch;
    };
  },
};
export default meta;
type Story = StoryObj<typeof SpendingSummary>;

export const Loading: Story = {
  beforeEach: () =>
    setMockSpendingSummary({ data: null, loading: true, error: null }),
};

export const IndexerError: Story = {
  name: 'Error (indexer unavailable)',
  beforeEach: () =>
    setMockSpendingSummary({
      data: null,
      loading: false,
      error: 'Indexer unavailable',
    }),
};

export const Empty: Story = {
  beforeEach: () =>
    setMockSpendingSummary({ data: EMPTY, loading: false, error: null }),
};

export const Loaded: Story = {
  beforeEach: () =>
    setMockSpendingSummary({ data: LOADED, loading: false, error: null }),
};
