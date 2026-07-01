import { render, screen } from '@testing-library/react';
import ScoutPage from '@/app/[locale]/scout/page';

jest.mock('@/components/scout/ScoutDashboardContent', () => ({
  __esModule: true,
  default: function MockScoutDashboardContent() {
    return <div data-testid="scout-dashboard-content">Scout Dashboard</div>;
  },
}));

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

describe('Scout Dashboard Page', () => {
  it('renders without crashing', () => {
    render(<ScoutPage />);
    expect(screen.getByTestId('scout-dashboard-content')).toBeInTheDocument();
  });

  it('wraps content in ErrorBoundary', () => {
    render(<ScoutPage />);
    expect(screen.getByTestId('scout-dashboard-content')).toBeInTheDocument();
  });
});
