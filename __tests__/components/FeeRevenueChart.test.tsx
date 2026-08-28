import { render, screen } from '@testing-library/react';
import FeeRevenueChart from '@/components/admin/FeeRevenueChart';
import { useFeeRevenue } from '@/hooks/useFeeRevenue';
import { useFeeDriftDetection } from '@/hooks/useFeeDriftDetection';

jest.mock('@/hooks/useFeeRevenue', () => ({
  useFeeRevenue: jest.fn(),
}));

jest.mock('@/hooks/useFeeDriftDetection', () => ({
  useFeeDriftDetection: jest.fn(),
}));

// Mock recharts ResponsiveContainer to render children directly in tests
jest.mock('recharts', () => {
  const OriginalModule = jest.requireActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

const mockUseFeeRevenue = useFeeRevenue as jest.MockedFunction<typeof useFeeRevenue>;
const mockUseFeeDriftDetection = useFeeDriftDetection as jest.MockedFunction<
  typeof useFeeDriftDetection
>;

describe('FeeRevenueChart component', () => {
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

  it('renders loading state', () => {
    mockUseFeeRevenue.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: jest.fn(),
    });

    render(<FeeRevenueChart />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockUseFeeRevenue.mockReturnValue({
      data: null,
      loading: false,
      error: 'Indexer error',
      refetch: jest.fn(),
    });

    render(<FeeRevenueChart />);
    expect(
      screen.getByText(/Failed to load fee revenue. The indexer may be unavailable./i),
    ).toBeInTheDocument();
  });

  it('renders revenue totals and period buttons', () => {
    mockUseFeeRevenue.mockReturnValue({
      data: {
        daily: [
          {
            date: '2026-08-20',
            contactFeeXlm: 2,
            subscriptionXlm: 12,
            totalXlm: 14,
          },
        ],
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<FeeRevenueChart />);
    expect(screen.getByText('Fee Revenue')).toBeInTheDocument();
    expect(screen.getByText(/14(\.00)?\s*XLM/i)).toBeInTheDocument();
  });

  it('renders warning alert banner when fee drift is detected', () => {
    mockUseFeeRevenue.mockReturnValue({
      data: { daily: [] },
      loading: false,
      error: null,
      refetch: jest.fn(),
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

    render(<FeeRevenueChart />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/On-chain fee drift detected/i)).toBeInTheDocument();
  });
});
