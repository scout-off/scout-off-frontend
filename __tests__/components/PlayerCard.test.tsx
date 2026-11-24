import { render, screen, fireEvent } from '@testing-library/react';
import type { Player } from '@/types';
import { PROGRESS_LABELS } from '@/types';
import { FOOTBALL_POSITIONS } from '@/lib/positions';

// ── Module mocks (hoisted by Jest) ───────────────────────────────────────────

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
    />
  ),
}));

jest.mock('next/navigation', () => ({
  __esModule: true,
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

jest.mock('swr', () => ({
  __esModule: true,
  default: jest
    .fn()
    .mockReturnValue({ data: undefined, error: undefined, isLoading: false }),
  mutate: jest.fn(),
}));

// ── Typed mock handles ────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import PlayerCard from '@/components/PlayerCard';

const mockUseRouter = useRouter as jest.Mock;
const mockMutate = mutate as jest.Mock;
const mockUseSWR = useSWR as jest.Mock;

// ── Shared fixture ────────────────────────────────────────────────────────────

const mockPlayer: Player = {
  id: 'player-123',
  wallet: 'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV',
  vitals: {
    name: 'Ava Rodriguez',
    age: 21,
    position: 'Forward',
    region: 'Europe',
    nationality: 'Spain',
  },
  ipfsHash: 'QmRJzSVrP1bqfSL4E8hKM7bCqYjDG4rMxUhsr5xKFN6sct',
  progressLevel: 2,
  milestones: [
    {
      id: 'milestone-1',
      description: 'Scored 20 goals in the last season',
      evidenceHash: 'QmYwAPJzv5CZsnAzt8auV2Zh6Z7ni1e8jX4rv19rMeS5qD',
      validator: 'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV',
      timestamp: 1700000000,
    },
  ],
  createdAt: 1670000000,
};

function makeMockRouter() {
  const push = jest.fn();
  const prefetch = jest.fn();
  mockUseRouter.mockReturnValue({ push, prefetch });
  return { push, prefetch };
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_IPFS_GATEWAY = 'https://ipfs.example.com/ipfs';
});

beforeEach(() => {
  jest.clearAllMocks();
  makeMockRouter();
});

// ── Existing rendering tests ──────────────────────────────────────────────────

describe('PlayerCard — rendering', () => {
  it('renders the player name', () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(
      screen.getByRole('heading', { level: 3, name: mockPlayer.vitals.name }),
    ).toBeInTheDocument();
  });

  it('renders position and region in the details text', () => {
    render(<PlayerCard player={mockPlayer} />);
    // The position is now wrapped in a Tooltip span, so the combined text is
    // split across sibling nodes. Use a regex to match both parts together.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent ===
            `${mockPlayer.vitals.position} · ${mockPlayer.vitals.region}`,
      ),
    ).toBeInTheDocument();
    // Position is now inside a Tooltip wrapper so it renders as a child span.
    expect(screen.getByText(mockPlayer.vitals.position)).toBeInTheDocument();
    // Region appears as plain text in the same <p>; grab the containing paragraph.
    const para = screen.getByText(mockPlayer.vitals.position).closest('p');
    expect(para).toHaveTextContent(mockPlayer.vitals.region);
  });

  it('renders the progress level badge with the correct variant', () => {
    render(<PlayerCard player={mockPlayer} />);
    const progressLabel = screen.getByRole('status');
    expect(progressLabel).toBeInTheDocument();
    expect(progressLabel).toHaveTextContent(
      PROGRESS_LABELS[mockPlayer.progressLevel],
    );
    expect(progressLabel).toHaveClass('text-yellow-800');
  });

  it('links to the correct player id', () => {
    render(<PlayerCard player={mockPlayer} />);
    const viewProfileLink = screen.getByRole('link', { hidden: true });
    expect(viewProfileLink).toHaveAttribute('href', `/player/${mockPlayer.id}`);
  });

  it('renders the player image when an IPFS hash is present, via the media proxy route', () => {
    render(<PlayerCard player={mockPlayer} />);
    const image = screen.getByAltText(mockPlayer.vitals.name);
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', `/api/media/${mockPlayer.ipfsHash}`);
  });

  it('shows a placeholder when no IPFS image CID is set', () => {
    render(<PlayerCard player={{ ...mockPlayer, ipfsHash: '' }} />);
    expect(
      screen.queryByAltText(mockPlayer.vitals.name),
    ).not.toBeInTheDocument();
  });
});

// ── Position tooltip ──────────────────────────────────────────────────────────

describe('PlayerCard — position tooltip', () => {
  it('shows the full position name tooltip on focus of the position abbreviation', () => {
    const playerWithKnownPosition: Player = {
      ...mockPlayer,
      vitals: { ...mockPlayer.vitals, position: 'ST' },
    };
    render(<PlayerCard player={playerWithKnownPosition} />);

    // The abbreviated position text should be in the document
    expect(screen.getByText('ST')).toBeInTheDocument();

    // Focus the position span to trigger the tooltip
    fireEvent.focus(screen.getByText('ST'));

    // The full position label should now be visible as a tooltip
    expect(screen.getByRole('tooltip')).toHaveTextContent('Striker');
  });

  it('shows the full position name tooltip on mouse enter', () => {
    const playerWithKnownPosition: Player = {
      ...mockPlayer,
      vitals: { ...mockPlayer.vitals, position: 'CAM' },
    };
    render(<PlayerCard player={playerWithKnownPosition} />);

    fireEvent.mouseEnter(screen.getByText('CAM'));

    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Attacking Midfielder',
    );
  });

  it('hides the tooltip on blur', () => {
    const playerWithKnownPosition: Player = {
      ...mockPlayer,
      vitals: { ...mockPlayer.vitals, position: 'CB' },
    };
    render(<PlayerCard player={playerWithKnownPosition} />);

    fireEvent.focus(screen.getByText('CB'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.blur(screen.getByText('CB'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('falls back to the raw position value when abbreviation is not in the map', () => {
    // 'Forward' is not a key in FOOTBALL_POSITIONS — tooltip should still show
    render(<PlayerCard player={mockPlayer} />);
    fireEvent.focus(screen.getByText('Forward'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Forward');
  });
});

// ── #895: Position abbreviation Tooltip ──────────────────────────────────────

describe('PlayerCard — position Tooltip', () => {
  it('shows the full position name in a tooltip on hover for a known abbreviation', () => {
    // Use a player with a known FOOTBALL_POSITIONS value so the lookup works.
    const stPlayer: Player = {
      ...mockPlayer,
      vitals: { ...mockPlayer.vitals, position: 'ST' },
    };
    const expectedLabel = FOOTBALL_POSITIONS.find(
      (p) => p.value === 'ST',
    )!.label; // 'Striker'

    render(<PlayerCard player={stPlayer} />);

    // The abbreviation badge should be visible.
    expect(screen.getByText('ST')).toBeInTheDocument();

    // Hover over the position span to trigger the tooltip.
    fireEvent.mouseEnter(screen.getByText('ST'));

    // Tooltip content should now be in the document.
    expect(screen.getByRole('tooltip')).toHaveTextContent(expectedLabel);
  });

  it('hides the tooltip after mouseLeave', () => {
    const stPlayer: Player = {
      ...mockPlayer,
      vitals: { ...mockPlayer.vitals, position: 'ST' },
    };
    render(<PlayerCard player={stPlayer} />);

    const positionEl = screen.getByText('ST');
    fireEvent.mouseEnter(positionEl);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(positionEl);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('falls back to the raw abbreviation text when the position is not in the map', () => {
    // 'Forward' is not in FOOTBALL_POSITIONS so POSITION_LABEL won't have it.
    render(<PlayerCard player={mockPlayer} />);
    const positionEl = screen.getByText('Forward');
    fireEvent.mouseEnter(positionEl);
    // Tooltip should still render, falling back to the raw value.
    expect(screen.getByRole('tooltip')).toHaveTextContent('Forward');
  });
});

// ── Debounced prefetch on hover (desktop) ────────────────────────────────────

describe('PlayerCard — debounced prefetch on mouse hover', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not prefetch immediately on mouseenter', () => {
    const { prefetch } = makeMockRouter();
    render(<PlayerCard player={mockPlayer} />);

    fireEvent.mouseEnter(screen.getByRole('article'));

    expect(prefetch).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('does not prefetch before 200ms have elapsed', () => {
    const { prefetch } = makeMockRouter();
    render(<PlayerCard player={mockPlayer} />);

    fireEvent.mouseEnter(screen.getByRole('article'));
    jest.advanceTimersByTime(199);

    expect(prefetch).not.toHaveBeenCalled();
  });

  it('prefetches the route exactly at 200ms', () => {
    const { prefetch } = makeMockRouter();
    render(<PlayerCard player={mockPlayer} />);

    fireEvent.mouseEnter(screen.getByRole('article'));
    jest.advanceTimersByTime(200);

    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith(`/player/${mockPlayer.id}`);
  });

  it('cancels the pending prefetch when the pointer leaves before 200ms', () => {
    const { prefetch } = makeMockRouter();
    render(<PlayerCard player={mockPlayer} />);
    const card = screen.getByRole('article');

    fireEvent.mouseEnter(card);
    jest.advanceTimersByTime(100);
    fireEvent.mouseLeave(card);
    jest.advanceTimersByTime(300);

    expect(prefetch).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('resets the debounce on rapid hover-out / hover-in and fires only once', () => {
    const { prefetch } = makeMockRouter();
    render(<PlayerCard player={mockPlayer} />);
    const card = screen.getByRole('article');

    // Rapid in-out-in: the second enter should reset the 200ms window.
    fireEvent.mouseEnter(card);
    jest.advanceTimersByTime(100);
    fireEvent.mouseLeave(card);
    fireEvent.mouseEnter(card);
    jest.advanceTimersByTime(200);

    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it('seeds the SWR cache after 200ms hover', () => {
    makeMockRouter();
    render(<PlayerCard player={mockPlayer} />);

    fireEvent.mouseEnter(screen.getByRole('article'));
    jest.advanceTimersByTime(200);

    expect(mockMutate).toHaveBeenCalledWith(
      `player:${mockPlayer.id}`,
      expect.any(Function),
      { revalidate: false },
    );
  });

  it('cache updater seeds when the key is absent and preserves fresher data', () => {
    makeMockRouter();
    render(<PlayerCard player={mockPlayer} />);

    fireEvent.mouseEnter(screen.getByRole('article'));
    jest.advanceTimersByTime(200);

    const updater = mockMutate.mock.calls[0][1] as (
      existing: Player | null | undefined,
    ) => Player;

    // No existing cache entry → use card data.
    expect(updater(undefined)).toBe(mockPlayer);

    // Existing cache entry → keep it unchanged.
    const fresherPlayer = { ...mockPlayer, progressLevel: 3 as const };
    expect(updater(fresherPlayer)).toBe(fresherPlayer);
  });
});

// ── Immediate prefetch on touch ───────────────────────────────────────────────

describe('PlayerCard — immediate prefetch on touch', () => {
  it('prefetches the route immediately on touchstart', () => {
    const { prefetch } = makeMockRouter();
    render(<PlayerCard player={mockPlayer} />);

    fireEvent.touchStart(screen.getByRole('article'));

    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith(`/player/${mockPlayer.id}`);
  });

  it('seeds the SWR cache immediately on touchstart', () => {
    makeMockRouter();
    render(<PlayerCard player={mockPlayer} />);

    fireEvent.touchStart(screen.getByRole('article'));

    expect(mockMutate).toHaveBeenCalledWith(
      `player:${mockPlayer.id}`,
      expect.any(Function),
      { revalidate: false },
    );
  });
});

// ── No idle background activity ───────────────────────────────────────────────

describe('PlayerCard — no idle RPC traffic', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not call prefetch or mutate without user interaction', () => {
    makeMockRouter();
    render(<PlayerCard player={mockPlayer} />);
    jest.advanceTimersByTime(5_000);

    expect(mockUseRouter().prefetch).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });
});

// ── Batched milestone data (issue #781) ───────────────────────────────────────
//
// Callers that already have milestone data for a whole visible batch of
// players (e.g. the virtualized scout grid via useMilestonesBatch) pass it
// in as a prop instead of letting the card fetch its own — this is what
// eliminates the one-RPC-call-per-card fan-out. Standalone usage (no
// milestones prop) must keep working exactly as before.

describe('PlayerCard — externally-supplied milestones', () => {
  beforeEach(() => {
    mockUseSWR.mockClear();
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
    });
  });

  it('does not call its own SWR fetch when a milestones prop is supplied', () => {
    render(<PlayerCard player={mockPlayer} milestones={[]} />);
    // useSWR is still called (rules of hooks), but with a null key so SWR
    // itself never issues a fetch for it.
    expect(mockUseSWR).toHaveBeenCalledWith(
      null,
      expect.any(Function),
      expect.any(Object),
    );
  });

  it('renders the milestone count from the milestones prop, not internal SWR data', () => {
    render(
      <PlayerCard
        player={mockPlayer}
        milestones={[
          {
            id: 'm1',
            description: 'x',
            evidenceHash: 'Qm1',
            validator: 'G1',
            timestamp: 0,
          },
          {
            id: 'm2',
            description: 'y',
            evidenceHash: 'Qm2',
            validator: 'G2',
            timestamp: 1,
          },
        ]}
      />,
    );
    expect(screen.getByText('2 milestones')).toBeInTheDocument();
  });

  it('shows the loading skeleton while milestonesLoading is true, even with an empty milestones array', () => {
    render(
      <PlayerCard player={mockPlayer} milestones={[]} milestonesLoading />,
    );
    expect(screen.queryByText(/milestones/)).not.toBeInTheDocument();
  });

  it('falls back to its own SWR fetch when no milestones prop is passed (standalone usage)', () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(mockUseSWR).toHaveBeenCalledWith(
      `milestones:${mockPlayer.id}`,
      expect.any(Function),
      expect.any(Object),
    );
  });
});
