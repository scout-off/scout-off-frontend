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
    const now = Date.now();
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
});
