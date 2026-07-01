import { render, screen, waitFor, act } from '@testing-library/react';
import ActivityFeed from '@/components/scout/ActivityFeed';

const mockGet = jest.fn();
jest.mock('@/lib/api', () => ({
  get: (...args: any[]) => mockGet(...args),
}));

const mockUseContractEvents = jest.fn();
jest.mock('@/hooks/useContractEvents', () => ({
  useContractEvents: (...args: any[]) => mockUseContractEvents(...args),
}));

describe('ActivityFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseContractEvents.mockReturnValue({ events: [], isLive: false });
  });

  it('renders the section heading', async () => {
    mockGet.mockResolvedValue({ data: [] });
    render(<ActivityFeed />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /activity feed/i }),
      ).toBeInTheDocument();
    });
  });

  it('renders an empty state when the event list is empty', async () => {
    mockGet.mockResolvedValue({ data: [] });
    render(<ActivityFeed />);

    await waitFor(() => {
      expect(screen.getByText('No recent activity.')).toBeInTheDocument();
    });
  });

  it('renders a list of activity items with correct event type labels', async () => {
    const now = Date.now();
    const events = [
      {
        id: 'evt-1',
        type: 'player_registered',
        createdAt: Math.floor(now / 1000) - 60,
        payload: { playerName: 'John Doe' },
      },
      {
        id: 'evt-2',
        type: 'milestone_approved',
        createdAt: Math.floor(now / 1000) - 120,
        payload: { scoutName: 'Jane', milestone: 'Speed Drill' },
      },
      {
        id: 'evt-3',
        type: 'trial_offer_logged',
        createdAt: Math.floor(now / 1000) - 180,
        payload: { playerId: 'player-3' },
      },
    ];
    mockGet.mockResolvedValue({ data: events });

    render(<ActivityFeed />);

    await waitFor(() => {
      expect(screen.getByText('John Doe registered')).toBeInTheDocument();
      expect(screen.getByText('Jane approved Speed Drill')).toBeInTheDocument();
      expect(
        screen.getByText('player-3 received a trial offer'),
      ).toBeInTheDocument();
    });
  });

  it('shows timestamps in a human-readable format', async () => {
    // Freeze the clock so the "Xs ago" label can't drift while the
    // component fetches/renders under CI load.
    const now = 1_700_000_000_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const events = [
      {
        id: 'evt-1',
        type: 'player_registered',
        createdAt: Math.floor(now / 1000) - 10,
        payload: { playerName: 'Alice' },
      },
    ];
    mockGet.mockResolvedValue({ data: events });

    render(<ActivityFeed />);

    await waitFor(() => {
      expect(screen.getByText('10s ago')).toBeInTheDocument();
    });

    dateNowSpy.mockRestore();
  });

  it('shows a loading skeleton while events are being fetched', async () => {
    let resolvePromise!: (value: unknown) => void;
    mockGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
    );

    const { container } = render(<ActivityFeed />);

    // Skeleton placeholders should be present
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
    expect(screen.queryByText('No recent activity.')).not.toBeInTheDocument();

    await act(async () => {
      resolvePromise({ data: [] });
    });

    await waitFor(() => {
      expect(screen.getByText('No recent activity.')).toBeInTheDocument();
      expect(container.querySelectorAll('.animate-pulse').length).toBe(0);
    });
  });

  it('shows a Live badge when isLive is true', async () => {
    mockUseContractEvents.mockReturnValue({ events: [], isLive: true });
    mockGet.mockResolvedValue({ data: [] });

    render(<ActivityFeed />);

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });
  });

  it('scopes the request and results to the given scoutId', async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          id: 'evt-1',
          type: 'player_registered',
          createdAt: Math.floor(Date.now() / 1000),
          payload: { playerName: 'Mine', scoutId: 'scout-1' },
        },
        {
          id: 'evt-2',
          type: 'player_registered',
          createdAt: Math.floor(Date.now() / 1000),
          payload: { playerName: 'Other', scoutId: 'scout-2' },
        },
      ],
    });

    render(<ActivityFeed scoutId="scout-1" />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('scoutId=scout-1'),
      );
      expect(screen.getByText('Mine registered')).toBeInTheDocument();
      expect(screen.queryByText('Other registered')).not.toBeInTheDocument();
    });
  });

  it('shows the empty state when the fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('network down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<ActivityFeed />);

    await waitFor(() => {
      expect(screen.getByText('No recent activity.')).toBeInTheDocument();
    });

    (console.error as jest.Mock).mockRestore();
  });

  it('merges new live events onto the top of the feed', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockUseContractEvents.mockReturnValue({ events: [], isLive: true });

    const { rerender } = render(<ActivityFeed />);

    await waitFor(() => {
      expect(screen.getByText('No recent activity.')).toBeInTheDocument();
    });

    mockUseContractEvents.mockReturnValue({
      events: [
        {
          id: 'live-1',
          type: 'player_registered',
          createdAt: Math.floor(Date.now() / 1000),
          payload: { playerName: 'Live Player' },
        },
      ],
      isLive: true,
    });
    rerender(<ActivityFeed />);

    await waitFor(() => {
      expect(screen.getByText('Live Player registered')).toBeInTheDocument();
    });
  });
});
