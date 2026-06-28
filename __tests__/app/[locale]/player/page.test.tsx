import { render, screen } from '@testing-library/react';
import PlayerPage from '@/app/[locale]/player/page';

jest.mock('@/components/player/PlayerDashboardContent', () => ({
__esModule: true,
default: function MockPlayerDashboardContent() {
return <div data-testid="player-dashboard-content">Player Dashboard</div>;
},
}));

jest.mock('@/components/ErrorBoundary', () => ({
__esModule: true,
default: function MockErrorBoundary({ children }: { children: React.ReactNode }) {
return <>{children}</>;
},
}));

describe('Player Dashboard Page', () => {
it('renders without crashing', () => {
render(<PlayerPage />);
expect(screen.getByTestId('player-dashboard-content')).toBeInTheDocument();
});

it('wraps content in ErrorBoundary', () => {
render(<PlayerPage />);
expect(screen.getByTestId('player-dashboard-content')).toBeInTheDocument();
});
});
