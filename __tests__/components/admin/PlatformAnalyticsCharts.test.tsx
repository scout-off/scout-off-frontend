import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlatformAnalyticsCharts from '@/components/admin/PlatformAnalyticsCharts';
import { usePlatformAnalytics } from '@/hooks/usePlatformAnalytics';
import type { PlatformAnalyticsData } from '@/hooks/usePlatformAnalytics';

jest.mock('@/hooks/usePlatformAnalytics', () => ({
  usePlatformAnalytics: jest.fn(),
}));

// recharts relies on ResizeObserver and SVG measurement APIs that jsdom does
// not implement. Stub ResponsiveContainer to just render its children at a
// fixed size so chart content is exercised without jsdom layout errors.
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts') as Record<string, unknown>;
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
    }: {
      children: React.ReactNode;
      width?: number | string;
      height?: number | string;
    }) => <div data-testid="responsive-container">{children}</div>,
  };
});

const mockUsePlatformAnalytics = usePlatformAnalytics as jest.Mock;
const refetch = jest.fn();

const ANALYTICS_FIXTURE: PlatformAnalyticsData = {
  playersCumulative: [
    { date: '2024-01-01', count: 10 },
    { date: '2024-01-02', count: 25 },
    { date: '2024-01-03', count: 42 },
  ],
  scoutsCumulative: [
    { date: '2024-01-01', count: 3 },
    { date: '2024-01-02', count: 7 },
    { date: '2024-01-03', count: 11 },
  ],
  milestonesPerWeek: [
    { weekStart: '2023-12-25', count: 5 },
    { weekStart: '2024-01-01', count: 14 },
  ],
};

function baseState(
  overrides: Partial<ReturnType<typeof usePlatformAnalytics>> = {},
) {
  return {
    data: null,
    loading: false,
    error: null,
    refetch,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PlatformAnalyticsCharts', () => {
  it('shows a loading message while data is being fetched', () => {
    mockUsePlatformAnalytics.mockReturnValue(baseState({ loading: true }));
    render(<PlatformAnalyticsCharts />);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    // Section heading should still render during loading
    expect(screen.getByText('Platform Analytics')).toBeInTheDocument();
  });

  it('shows an error message when the hook returns an error', () => {
    mockUsePlatformAnalytics.mockReturnValue(
      baseState({ error: 'indexer unavailable' }),
    );
    render(<PlatformAnalyticsCharts />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'Failed to load analytics. The indexer may be unavailable.',
    );
  });

  it('shows the empty state when data is null and not loading', () => {
    mockUsePlatformAnalytics.mockReturnValue(baseState({ data: null }));
    render(<PlatformAnalyticsCharts />);

    expect(screen.getByText('No analytics data yet')).toBeInTheDocument();
    expect(
      screen.getByText(/charts will populate as players register/i),
    ).toBeInTheDocument();
  });

  it('shows the empty state when all series are empty arrays', () => {
    mockUsePlatformAnalytics.mockReturnValue(
      baseState({
        data: {
          playersCumulative: [],
          scoutsCumulative: [],
          milestonesPerWeek: [],
        },
      }),
    );
    render(<PlatformAnalyticsCharts />);

    expect(screen.getByText('No analytics data yet')).toBeInTheDocument();
  });

  it('renders the section heading and chart titles with populated data', () => {
    mockUsePlatformAnalytics.mockReturnValue(
      baseState({ data: ANALYTICS_FIXTURE }),
    );
    render(<PlatformAnalyticsCharts />);

    expect(screen.getByText('Platform Analytics')).toBeInTheDocument();
    expect(
      screen.getByText('Cumulative Players Registered'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cumulative Scouts Registered'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Milestones Approved Per Week'),
    ).toBeInTheDocument();
  });

  it('renders charts (ResponsiveContainer) for each series when data is present', () => {
    mockUsePlatformAnalytics.mockReturnValue(
      baseState({ data: ANALYTICS_FIXTURE }),
    );
    render(<PlatformAnalyticsCharts />);

    // Three charts: players line, scouts line, milestones bar
    expect(screen.getAllByTestId('responsive-container')).toHaveLength(3);
  });

  it('renders the date-range filter inputs', () => {
    mockUsePlatformAnalytics.mockReturnValue(
      baseState({ data: ANALYTICS_FIXTURE }),
    );
    render(<PlatformAnalyticsCharts />);

    expect(screen.getByLabelText(/^from$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^to$/i)).toBeInTheDocument();
  });

  it('shows the Clear button only after a date input is filled in', () => {
    mockUsePlatformAnalytics.mockReturnValue(
      baseState({ data: ANALYTICS_FIXTURE }),
    );
    render(<PlatformAnalyticsCharts />);

    expect(
      screen.queryByRole('button', { name: /clear/i }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^from$/i), {
      target: { value: '2024-01-01' },
    });

    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('clears both date inputs when the Clear button is clicked', () => {
    mockUsePlatformAnalytics.mockReturnValue(
      baseState({ data: ANALYTICS_FIXTURE }),
    );
    render(<PlatformAnalyticsCharts />);

    const fromInput = screen.getByLabelText(/^from$/i);
    fireEvent.change(fromInput, { target: { value: '2024-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect((fromInput as HTMLInputElement).value).toBe('');
    expect(
      screen.queryByRole('button', { name: /clear/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the section empty state when the date filter excludes all points', () => {
    mockUsePlatformAnalytics.mockReturnValue(
      baseState({ data: ANALYTICS_FIXTURE }),
    );
    render(<PlatformAnalyticsCharts />);

    // Filter to a future range that has no data — every filtered series is
    // empty, so the whole section collapses to its empty state rather than
    // rendering three "No data in this range." charts.
    fireEvent.change(screen.getByLabelText(/^from$/i), {
      target: { value: '2099-01-01' },
    });

    expect(screen.getByText('No analytics data yet')).toBeInTheDocument();
    expect(
      screen.queryByText('No data in this range.'),
    ).not.toBeInTheDocument();
  });
});
