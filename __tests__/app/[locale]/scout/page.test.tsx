import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/components/scout/ScoutDashboardContent', () => ({
  __esModule: true,
  default: function MockScoutDashboardContent() {
    return <div data-testid="scout-dashboard-content">Scout Dashboard</div>;
  },
}));

// ErrorBoundary is a transparent pass-through so we can assert on the
// guard's render outcome without its retry button confounding the test.
jest.mock('@/components/ui/ErrorBoundary', () => ({
  __esModule: true,
  default: function MockErrorBoundary({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return <>{children}</>;
  },
}));

// Issue #7 — subscription guard: default mock returns "protected" so
// call sites that don't override see the happy-path render unchanged.
jest.mock('@/hooks/useRequireSubscription', () => ({
  useRequireSubscription: jest.fn().mockReturnValue({
    isProtected: true,
    loading: false,
  }),
}));

import ScoutPage from '@/app/[locale]/scout/page';
import { useRequireSubscription } from '@/hooks/useRequireSubscription';

const mockedUseRequireSubscription = useRequireSubscription as jest.Mock;

describe('Scout Dashboard Page — Issue #7 subscription guard', () => {
  beforeEach(() => {
    mockedUseRequireSubscription.mockReturnValue({
      isProtected: true,
      loading: false,
    });
  });

  it('renders <ScoutDashboardContent> when the subscription is valid', () => {
    render(<ScoutPage />);
    expect(screen.getByTestId('scout-dashboard-content')).toBeInTheDocument();
  });

  it('renders nothing while the subscription is loading (prevents flash of dashboard)', () => {
    mockedUseRequireSubscription.mockReturnValue({
      isProtected: false,
      loading: true,
    });
    render(<ScoutPage />);
    expect(
      screen.queryByTestId('scout-dashboard-content'),
    ).not.toBeInTheDocument();
  });

  it('renders nothing when there is no active subscription (prevents flash before redirect)', () => {
    mockedUseRequireSubscription.mockReturnValue({
      isProtected: false,
      loading: false,
    });
    render(<ScoutPage />);
    expect(
      screen.queryByTestId('scout-dashboard-content'),
    ).not.toBeInTheDocument();
  });

  it('flips back to rendering content if the subscription becomes valid after a load', () => {
    const { rerender } = render(<ScoutPage />);
    mockedUseRequireSubscription.mockReturnValue({
      isProtected: false,
      loading: true,
    });
    rerender(<ScoutPage />);
    expect(
      screen.queryByTestId('scout-dashboard-content'),
    ).not.toBeInTheDocument();

    mockedUseRequireSubscription.mockReturnValue({
      isProtected: true,
      loading: false,
    });
    rerender(<ScoutPage />);
    expect(screen.getByTestId('scout-dashboard-content')).toBeInTheDocument();
  });
});
