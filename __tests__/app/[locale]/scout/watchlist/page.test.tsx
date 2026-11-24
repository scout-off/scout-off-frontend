import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/hooks/useRequireWallet', () => ({
  useRequireWallet: jest.fn(),
}));

const mockUseWatchlist = jest.fn();
jest.mock('@/hooks/useWatchlist', () => ({
  useWatchlist: (...args: unknown[]) => mockUseWatchlist(...args),
}));

const mockGetPlayer = jest.fn();
jest.mock('@/lib/contract', () => ({
  getPlayer: (...args: unknown[]) => mockGetPlayer(...args),
}));

jest.mock('@/components/PlayerCard', () => ({
  __esModule: true,
  default: ({
    player,
    onToggleWatchlist,
  }: {
    player: { id: string };
    onToggleWatchlist?: () => void;
  }) => (
    <div data-testid="player-card">
      {player.id}
      <button onClick={onToggleWatchlist}>Remove</button>
    </div>
  ),
}));

jest.mock('@/components/PlayerCardSkeleton', () => ({
  __esModule: true,
  default: () => <div data-testid="player-card-skeleton" />,
}));

import WatchlistPage from '@/app/[locale]/scout/watchlist/page';
import { useRequireWallet } from '@/hooks/useRequireWallet';

const mockUseRequireWallet = useRequireWallet as jest.Mock;

const ENTRY_1 = {
  id: 1,
  scoutWallet: 'GSCOUT',
  playerId: 'player-1',
  createdAt: 0,
};
const ENTRY_2 = {
  id: 2,
  scoutWallet: 'GSCOUT',
  playerId: 'player-2',
  createdAt: 1,
};

const PLAYER_1 = { id: 'player-1', vitals: { name: 'Player One' } };
const PLAYER_2 = { id: 'player-2', vitals: { name: 'Player Two' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRequireWallet.mockReturnValue({ walletAddress: 'GSCOUT' });
  mockGetPlayer.mockImplementation((id: string) =>
    Promise.resolve(id === 'player-1' ? PLAYER_1 : PLAYER_2),
  );
});

describe('WatchlistPage', () => {
  it('renders nothing when no wallet is connected', () => {
    mockUseRequireWallet.mockReturnValue({ walletAddress: null });
    mockUseWatchlist.mockReturnValue({
      entries: [],
      loading: false,
      isWatched: () => false,
      add: jest.fn(),
      remove: jest.fn(),
    });
    const { container } = render(<WatchlistPage />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an empty state when the watchlist has no entries', () => {
    mockUseWatchlist.mockReturnValue({
      entries: [],
      loading: false,
      isWatched: () => false,
      add: jest.fn(),
      remove: jest.fn(),
    });
    render(<WatchlistPage />);
    expect(screen.getByText('Your watchlist is empty')).toBeInTheDocument();
  });

  it('shows skeletons while the watchlist is loading', () => {
    mockUseWatchlist.mockReturnValue({
      entries: [],
      loading: true,
      isWatched: () => false,
      add: jest.fn(),
      remove: jest.fn(),
    });
    render(<WatchlistPage />);
    expect(
      screen.getAllByTestId('player-card-skeleton').length,
    ).toBeGreaterThan(0);
  });

  it('fetches and renders a PlayerCard for every watchlist entry', async () => {
    mockUseWatchlist.mockReturnValue({
      entries: [ENTRY_1, ENTRY_2],
      loading: false,
      isWatched: () => true,
      add: jest.fn(),
      remove: jest.fn(),
    });
    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.getAllByTestId('player-card')).toHaveLength(2);
    });
    expect(mockGetPlayer).toHaveBeenCalledWith('player-1');
    expect(mockGetPlayer).toHaveBeenCalledWith('player-2');
  });

  it('removing an entry updates the view immediately', async () => {
    const remove = jest.fn();
    mockUseWatchlist.mockReturnValue({
      entries: [ENTRY_1],
      loading: false,
      isWatched: () => true,
      add: jest.fn(),
      remove,
    });
    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.getByTestId('player-card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Remove'));
    expect(remove).toHaveBeenCalledWith(ENTRY_1);
  });
});
