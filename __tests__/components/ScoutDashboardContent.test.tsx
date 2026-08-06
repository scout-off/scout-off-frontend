import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// jsdom doesn't implement IntersectionObserver; useInfiniteScroll (used by
// this component's pagination) constructs one on mount. This suite isn't
// testing scroll-triggered loading itself, so a no-op stub is enough to
// avoid the ReferenceError.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error partial IntersectionObserver stub, sufficient for jsdom
global.IntersectionObserver = MockIntersectionObserver;

// ── Mocks ─────────────────────────────────────────────────────────────────────

const DASHBOARD_WALLET =
  'GABC1234567890ABCDE1234567890ABCDE1234567890ABCDE123456';

jest.mock('@/hooks/useRequireWallet', () => ({
  useRequireWallet: () => ({
    walletAddress: DASHBOARD_WALLET,
  }),
}));

// useSubscription/useRequireSubscription (transitively, via
// useRequireSubscription -> useWallet -> useWalletContext) both need a real
// WalletProvider ancestor this suite doesn't render — mock useWallet
// directly instead.
jest.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({ publicKey: DASHBOARD_WALLET }),
}));

jest.mock('@/hooks/useRequireSubscription', () => ({
  useRequireSubscription: () => ({ isProtected: true, loading: false }),
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    subscription: { tier: 'pro', expiresAt: Date.now() + 1000 * 60 * 60 },
    isExpired: false,
    subscribe: jest.fn(),
    loading: false,
    error: null,
  }),
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show: jest.fn() }),
}));

// The real OnboardingTour renders a "Welcome to Scout Dashboard" heading and
// Previous/Next-step buttons on first visit (no dismissal recorded in
// jsdom's localStorage), which collide with this suite's own heading/button
// queries — mock it out since tour behavior isn't this suite's concern.
jest.mock('@/components/ui/OnboardingTour', () => ({
  __esModule: true,
  default: () => null,
}));

const mockSearch = jest.fn();
const mockUseScout = jest.fn();

jest.mock('@/hooks/useScout', () => ({
  useScout: () => mockUseScout(),
}));

jest.mock('@/lib/contract', () => ({
  getPlayer: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
}));

jest.mock('@/components/PlayerCard', () => ({
  __esModule: true,
  default: ({ player }: { player: { id: string } }) => (
    <div data-testid="player-card">{player.id}</div>
  ),
}));

jest.mock('@/components/PlayerCardSkeleton', () => ({
  __esModule: true,
  default: () => <div data-testid="player-card-skeleton" />,
}));

// PlayerFilterForm mock:
//  • fires onSearch once on mount (mirrors the real component behaviour)
//  • re-fires onSearch when resetKey increments
jest.mock('@/components/scout/PlayerFilterForm', () => {
  const { useEffect, useRef } = require('react');
  return {
    __esModule: true,
    default: function MockPlayerFilterForm({
      onSearch,
      resetKey = 0,
    }: {
      onSearch: (f: object) => void;
      resetKey?: number;
    }) {
      const prevKey = useRef(resetKey);

      useEffect(() => {
        onSearch({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      useEffect(() => {
        if (prevKey.current === resetKey) return;
        prevKey.current = resetKey;
        onSearch({});
      }, [resetKey, onSearch]);

      return <div data-testid="player-filter-form" />;
    },
  };
});

// ── Import the component under test (after mocks) ────────────────────────────

import ScoutDashboardContent from '@/components/scout/ScoutDashboardContent';
import { getPlayer } from '@/lib/contract';

const mockGetPlayer = getPlayer as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_SCOUT = {
  players: [],
  loading: false,
  error: null,
  isRateLimited: false,
  retryAfterSec: null,
  search: mockSearch,
  searchByName: jest.fn(),
  refetch: jest.fn(),
};

type ScoutState = typeof EMPTY_SCOUT;

function setupScout(overrides: Partial<ScoutState> = {}) {
  mockUseScout.mockReturnValue({ ...EMPTY_SCOUT, ...overrides });
}

function makePlayer(id: string) {
  return {
    id,
    wallet: `G${'A'.repeat(55)}`,
    vitals: {
      name: `Player ${id}`,
      age: 20,
      position: 'ST',
      region: 'NG',
      nationality: 'Nigerian',
    },
    ipfsHash: '',
    progressLevel: 0 as const,
    milestones: [],
    createdAt: 0,
  };
}

/**
 * Advance the mock through a full loading cycle: idle → loading → done.
 */
function simulateSearchCycle(
  rerender: (ui: React.ReactElement) => void,
  resultPlayers: ScoutState['players'] = [],
) {
  act(() => {
    mockUseScout.mockReturnValue({ ...EMPTY_SCOUT, loading: true });
    rerender(<ScoutDashboardContent />);
  });
  act(() => {
    mockUseScout.mockReturnValue({
      ...EMPTY_SCOUT,
      loading: false,
      players: resultPlayers,
    });
    rerender(<ScoutDashboardContent />);
  });
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('ScoutDashboardContent — initial render', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupScout();
  });

  it('renders the Scout Dashboard heading', () => {
    render(<ScoutDashboardContent />);
    expect(
      screen.getByRole('heading', { name: /scout dashboard/i }),
    ).toBeInTheDocument();
  });

  it('renders the wallet address search input', () => {
    render(<ScoutDashboardContent />);
    expect(
      screen.getByLabelText(/search by wallet address/i),
    ).toBeInTheDocument();
  });

  it('renders the PlayerFilterForm', () => {
    render(<ScoutDashboardContent />);
    expect(screen.getByTestId('player-filter-form')).toBeInTheDocument();
  });

  it('renders the filter form wrapper with data-testid', () => {
    render(<ScoutDashboardContent />);
    expect(screen.getByTestId('filter-form')).toBeInTheDocument();
  });
});

// ── Loading / skeleton state ──────────────────────────────────────────────────

describe('ScoutDashboardContent — loading state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading skeletons while a search is in progress for the first time', () => {
    setupScout({ loading: true });
    render(<ScoutDashboardContent />);
    expect(
      screen.getAllByTestId('player-card-skeleton').length,
    ).toBeGreaterThan(0);
  });

  it('does not show the empty state while loading', () => {
    setupScout({ loading: true });
    render(<ScoutDashboardContent />);
    expect(screen.queryByText('No players found')).not.toBeInTheDocument();
  });

  it('does not show player cards while loading', () => {
    setupScout({ loading: true });
    render(<ScoutDashboardContent />);
    expect(screen.queryByTestId('player-card')).not.toBeInTheDocument();
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('ScoutDashboardContent — empty state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupScout();
  });

  it('does not show the empty state on initial render before any search completes', () => {
    render(<ScoutDashboardContent />);
    expect(screen.queryByText('No players found')).not.toBeInTheDocument();
  });

  it('shows the empty state after a search completes with zero results', () => {
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(rerender, []);
    expect(screen.getByText('No players found')).toBeInTheDocument();
  });

  it('renders the empty state container with data-testid', () => {
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(rerender, []);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders the descriptive subtext in the empty state', () => {
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(rerender, []);
    expect(screen.getByText('Try adjusting your filters.')).toBeInTheDocument();
  });

  it('renders a "Reset Filters" button inside the empty state', () => {
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(rerender, []);
    expect(
      screen.getByRole('button', { name: /reset filters/i }),
    ).toBeInTheDocument();
  });

  it('hides the empty state while a subsequent search runs after it was shown', () => {
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(rerender, []);
    expect(screen.getByText('No players found')).toBeInTheDocument();

    act(() => {
      mockUseScout.mockReturnValue({
        ...EMPTY_SCOUT,
        loading: true,
        players: [],
      });
      rerender(<ScoutDashboardContent />);
    });
    expect(screen.queryByText('No players found')).not.toBeInTheDocument();
  });
});

// ── Filter / search interactions ──────────────────────────────────────────────

describe('ScoutDashboardContent — filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupScout();
  });

  it('calls search when PlayerFilterForm fires onSearch', () => {
    render(<ScoutDashboardContent />);
    // The mock PlayerFilterForm fires onSearch once on mount
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it('clicking "Reset Filters" triggers a new search with defaults', () => {
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(rerender, []);

    mockSearch.mockClear();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /reset filters/i }));
    });

    // PlayerFilterForm resets and calls onSearch once
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it('hides the empty state after "Reset Filters" triggers a new loading cycle', () => {
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(rerender, []);
    expect(screen.getByText('No players found')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /reset filters/i }));
    });

    act(() => {
      mockUseScout.mockReturnValue({ ...EMPTY_SCOUT, loading: true });
      rerender(<ScoutDashboardContent />);
    });
    expect(screen.queryByText('No players found')).not.toBeInTheDocument();
  });
});

// ── Results grid and player cards ─────────────────────────────────────────────

describe('ScoutDashboardContent — results', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupScout();
  });

  it('renders player cards when search returns results', () => {
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(rerender, [makePlayer('p1'), makePlayer('p2')]);
    expect(screen.getAllByTestId('player-card')).toHaveLength(2);
  });

  it('does not show the empty state when the search returns players', () => {
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(rerender, [makePlayer('p1')]);
    expect(screen.queryByText('No players found')).not.toBeInTheDocument();
  });

  it('shows a result count when players are returned', () => {
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(rerender, [makePlayer('p1'), makePlayer('p2')]);
    expect(screen.getByText(/2 players found/i)).toBeInTheDocument();
  });

  it('uses singular "player" in count when exactly one result is returned', () => {
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(rerender, [makePlayer('p1')]);
    expect(screen.getByText(/1 player found/i)).toBeInTheDocument();
  });
});

// ── Pagination ────────────────────────────────────────────────────────────────

describe('ScoutDashboardContent — pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupScout();
  });

  it('does not render pagination controls when results fit on one page', () => {
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(
      rerender,
      Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`)),
    );
    expect(
      screen.queryByRole('button', { name: /previous/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /next/i }),
    ).not.toBeInTheDocument();
  });

  it('renders pagination controls when results exceed one page (>12 items)', () => {
    const manyPlayers = Array.from({ length: 13 }, (_, i) =>
      makePlayer(`p${i}`),
    );
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(rerender, manyPlayers);
    expect(screen.getByTestId('pagination-prev')).toBeInTheDocument();
    expect(screen.getByTestId('pagination-next')).toBeInTheDocument();
  });

  it('Previous button is disabled on the first page', () => {
    const manyPlayers = Array.from({ length: 13 }, (_, i) =>
      makePlayer(`p${i}`),
    );
    const { rerender } = render(<ScoutDashboardContent />);
    simulateSearchCycle(rerender, manyPlayers);
    expect(screen.getByTestId('pagination-prev')).toBeDisabled();
  });
});

// ── Wallet address search ─────────────────────────────────────────────────────

describe('ScoutDashboardContent — wallet address search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupScout();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('shows an invalid address message for a malformed wallet key', () => {
    render(<ScoutDashboardContent />);
    const input = screen.getByLabelText(/search by wallet address/i);
    fireEvent.change(input, { target: { value: 'not-a-key' } });
    expect(screen.getByText(/invalid stellar address/i)).toBeInTheDocument();
  });

  it('shows "Searching…" while a valid wallet lookup is in-flight', async () => {
    mockGetPlayer.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ScoutDashboardContent />);
    const input = screen.getByLabelText(/search by wallet address/i);
    // A valid 56-char Stellar key
    const validKey = `G${'A'.repeat(55)}`;
    fireEvent.change(input, { target: { value: validKey } });

    // Advance past the 300 ms debounce
    act(() => {
      jest.advanceTimersByTime(350);
    });

    expect(screen.getByText(/searching/i)).toBeInTheDocument();
  });

  it('shows a not-found empty state when wallet lookup returns null', async () => {
    mockGetPlayer.mockResolvedValue(null);
    render(<ScoutDashboardContent />);
    const input = screen.getByLabelText(/search by wallet address/i);
    const validKey = `G${'A'.repeat(55)}`;
    fireEvent.change(input, { target: { value: validKey } });

    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });

    expect(screen.getByText(/no player is registered/i)).toBeInTheDocument();
  });
});
