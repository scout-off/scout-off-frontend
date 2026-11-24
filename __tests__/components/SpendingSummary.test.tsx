import { render, screen } from '@testing-library/react';
import SpendingSummary from '@/components/scout/SpendingSummary';
import { useSpendingSummary } from '@/hooks/useSpendingSummary';
import { useFeeDriftDetection } from '@/hooks/useFeeDriftDetection';

jest.mock('@/hooks/useSpendingSummary', () => ({
  useSpendingSummary: jest.fn(),
}));

jest.mock('@/hooks/useFeeDriftDetection', () => ({
  useFeeDriftDetection: jest.fn(),
}));

jest.mock('@/components/ui/XlmFiatDisplay', () => ({
  __esModule: true,
  default: ({ xlmAmount }: { xlmAmount: number }) => (
    <div data-testid="xlm-fiat-display">{xlmAmount} XLM</div>
  ),
}));

const mockUseSpendingSummary = useSpendingSummary as jest.MockedFunction<
  typeof useSpendingSummary
>;
const mockUseFeeDriftDetection = useFeeDriftDetection as jest.MockedFunction<
  typeof useFeeDriftDetection
>;

describe('SpendingSummary component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFeeDriftDetection.mockReturnValue({
      hasDrift: false,
      liveContactFee: 1,
      expectedContactFee: 1,
      warningMessage: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('renders loading spinner when loading', () => {
    mockUseSpendingSummary.mockReturnValue({
      data: null,
      loading: true,
      error: null,
    });

    render(<SpendingSummary />);
    expect(screen.getByText('Spending Summary')).toBeInTheDocument();
  });

  it('renders error message when error occurs', () => {
    mockUseSpendingSummary.mockReturnValue({
      data: null,
      loading: false,
      error: 'Failed to load',
    });

    render(<SpendingSummary />);
    expect(
      screen.getByText(
        /Could not load spending data. The indexer may be unavailable./i,
      ),
    ).toBeInTheDocument();
  });

  it('renders totals and monthly breakdown when spending data exists', () => {
    mockUseSpendingSummary.mockReturnValue({
      data: {
        totalContactFeesXlm: 2,
        totalSubscriptionsXlm: 12,
        totalXlm: 14,
        monthlyBreakdown: [
          {
            monthKey: '2026-08',
            label: 'Aug 2026',
            contactFeeXlm: 2,
            subscriptionXlm: 12,
            totalXlm: 14,
          },
        ],
      },
      loading: false,
      error: null,
    });

    render(<SpendingSummary />);
    expect(screen.getByText('Spending Summary')).toBeInTheDocument();
    expect(screen.getAllByTestId('xlm-fiat-display')).toHaveLength(3);
    expect(
      screen
        .getAllByTestId('xlm-fiat-display')
        .map((display) => display.textContent),
    ).toEqual(['2 XLM', '12 XLM', '14 XLM']);
    expect(screen.getByText('Aug 2026')).toBeInTheDocument();
  });

  it('renders the empty state when no spending has been recorded', () => {
    mockUseSpendingSummary.mockReturnValue({
      data: {
        totalContactFeesXlm: 0,
        totalSubscriptionsXlm: 0,
        totalXlm: 0,
        monthlyBreakdown: [],
      },
      loading: false,
      error: null,
    });

    render(<SpendingSummary />);

    expect(
      screen.getByText(
        /No payments recorded yet\. Your spending history will appear here/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Monthly Breakdown')).not.toBeInTheDocument();
  });

  it('renders drift alert banner when on-chain fee drift is detected', () => {
    mockUseSpendingSummary.mockReturnValue({
      data: {
        totalContactFeesXlm: 0,
        totalSubscriptionsXlm: 0,
        totalXlm: 0,
        monthlyBreakdown: [],
      },
      loading: false,
      error: null,
    });

    mockUseFeeDriftDetection.mockReturnValue({
      hasDrift: true,
      liveContactFee: 2,
      expectedContactFee: 1,
      warningMessage:
        'On-chain fee drift detected: Contract pay-to-contact fee is currently 2 XLM, but the frontend fee schedule is configured for 1 XLM.',
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<SpendingSummary />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(/On-chain fee drift detected/i),
    ).toBeInTheDocument();
  });
});
