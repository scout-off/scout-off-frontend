/**
 * Issue #27 — page-level test coverage.
 * Tests for the scout public profile page (app/[locale]/scout/[id]/page.tsx).
 *
 * The page is a server component that delegates to fetchScoutProfile and
 * renders ScoutProfileCard + ActivityFeed. We render it directly with a
 * stubbed `fetchScoutProfile` and assert the empty-state fallback and the
 * successful-render branches.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/lib/api', () => ({
  fetchScoutProfile: jest.fn(),
}));

jest.mock('@/components/scout/ScoutProfileCard', () => ({
  __esModule: true,
  default: ({ scout }: { scout: { id: string; name: string } }) => (
    <div data-testid="scout-profile-card">{scout.name}</div>
  ),
}));

jest.mock('@/components/scout/ActivityFeed', () => ({
  __esModule: true,
  default: ({ scoutId }: { scoutId: string }) => (
    <div data-testid="activity-feed">{scoutId}</div>
  ),
}));

jest.mock('@/components/ui/EmptyState', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
}));

// next-intl hooks are mocked in jest.setup.ts; nothing extra needed here.

import { fetchScoutProfile } from '@/lib/api';
import ScoutProfilePage from '@/app/[locale]/scout/[id]/page';

const mockFetch = fetchScoutProfile as jest.Mock;

const SCOUT = {
  id: 'scout-1',
  wallet: 'GSCOUTWALLET0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJK',
  name: 'Lena Park',
  organisation: 'Grassroots United',
  subscriptionTier: 'pro' as const,
  subscriptionExpiry: 1_900_000_000,
  contactedPlayers: [] as string[],
};

const params = { params: { locale: 'en', id: 'scout-1' } };

beforeEach(() => {
  jest.resetAllMocks();
});

describe('ScoutProfilePage — found', () => {
  it('renders ScoutProfileCard and ActivityFeed when the scout is found', async () => {
    mockFetch.mockResolvedValue(SCOUT);

    const tree = await ScoutProfilePage(params);
    render(tree as unknown as React.ReactElement);

    expect(screen.getByTestId('scout-profile-card')).toHaveTextContent(
      'Lena Park',
    );
    expect(screen.getByTestId('activity-feed')).toHaveTextContent('scout-1');
    expect(screen.getByText('Scout Profile')).toBeInTheDocument();
  });
});

describe('ScoutProfilePage — not found', () => {
  it('renders EmptyState when the scout fetch returns null', async () => {
    mockFetch.mockResolvedValue(null);

    const tree = await ScoutProfilePage(params);
    render(tree as unknown as React.ReactElement);

    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'Scout not found',
    );
    expect(screen.queryByTestId('scout-profile-card')).not.toBeInTheDocument();
  });

  it('renders EmptyState when the scout fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network down'));

    const tree = await ScoutProfilePage(params);
    render(tree as unknown as React.ReactElement);

    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'Scout not found',
    );
  });
});
