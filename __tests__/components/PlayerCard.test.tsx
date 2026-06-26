import { render, screen, fireEvent } from '@testing-library/react';
import type { Player } from '@/types';
import { PROGRESS_LABELS } from '@/types';

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
    <img src={src} alt={alt} width={width} height={height} className={className} />
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
  mutate: jest.fn(),
}));

// ── Typed mock handles ────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import PlayerCard from '@/components/PlayerCard';

const mockUseRouter = useRouter as jest.Mock;
const mockMutate = mutate as jest.Mock;

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
    expect(
      screen.getByText(`${mockPlayer.vitals.position} · ${mockPlayer.vitals.region}`),
    ).toBeInTheDocument();
  });

  it('renders the progress level badge with the correct variant', () => {
    render(<PlayerCard player={mockPlayer} />);
    const progressLabel = screen.getByRole('status');
    expect(progressLabel).toBeInTheDocument();
    expect(progressLabel).toHaveTextContent(PROGRESS_LABELS[mockPlayer.progressLevel]);
    expect(progressLabel).toHaveClass('text-yellow-800');
  });

  it('links to the correct player id', () => {
    render(<PlayerCard player={mockPlayer} />);
    const viewProfileLink = screen.getByRole('link', { hidden: true });
    expect(viewProfileLink).toHaveAttribute('href', `/player/${mockPlayer.id}`);
  });

  it('renders the player image when an IPFS hash is present', () => {
    render(<PlayerCard player={mockPlayer} />);
    const image = screen.getByAltText(mockPlayer.vitals.name);
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute(
      'src',
      `${process.env.NEXT_PUBLIC_IPFS_GATEWAY}/${mockPlayer.ipfsHash}`,
    );
  });

  it('shows a placeholder when no IPFS image CID is set', () => {
    render(<PlayerCard player={{ ...mockPlayer, ipfsHash: '' }} />);
    expect(screen.queryByAltText(mockPlayer.vitals.name)).not.toBeInTheDocument();
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
