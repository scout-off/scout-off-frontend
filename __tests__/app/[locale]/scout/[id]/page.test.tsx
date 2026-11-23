import React from 'react';
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
    <div data-testid="activity-feed">feed:{scoutId}</div>
  ),
}));

jest.mock('@/components/ui/EmptyState', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

import ScoutProfilePage from '@/app/[locale]/scout/[id]/page';
import { fetchScoutProfile } from '@/lib/api';

const mockFetchScoutProfile = fetchScoutProfile as jest.Mock;

describe('ScoutProfilePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the scout profile card and activity feed for a valid id', async () => {
    mockFetchScoutProfile.mockResolvedValueOnce({
      id: 'scout-1',
      wallet: 'GABC123',
      name: 'Scout One',
      organisation: 'Test Academy',
      subscriptionTier: 'pro',
      subscriptionExpiry: 2000000000,
      contactedPlayers: [],
    });

    const element = await ScoutProfilePage({
      params: { locale: 'en', id: 'scout-1' },
    });
    render(<>{element}</>);

    expect(screen.getByTestId('scout-profile-card')).toHaveTextContent(
      'Scout One',
    );
    expect(screen.getByTestId('activity-feed')).toHaveTextContent(
      'feed:scout-1',
    );
  });

  it('renders an EmptyState when the scout id is not found', async () => {
    mockFetchScoutProfile.mockRejectedValueOnce(new Error('Not found'));

    const element = await ScoutProfilePage({
      params: { locale: 'en', id: 'missing-scout' },
    });
    render(<>{element}</>);

    expect(screen.getByText('Scout not found')).toBeInTheDocument();
  });
});
