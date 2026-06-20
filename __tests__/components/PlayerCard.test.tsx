import { render, screen, fireEvent } from '@testing-library/react';
import type { Player } from '@/types';
import PlayerCard from '@/components/PlayerCard';
import { PROGRESS_LABELS } from '@/types';

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

// Share a single router mock at module scope so the Space-keydown test
// can spy on `push` after rendering. Each PlayerCard render calls
// useRouter() once; returning the same object every call keeps the
// reference stable across renders within a single test run.
const routerMock = { push: jest.fn() };

jest.mock('next/navigation', () => ({
  __esModule: true,
  useRouter: () => routerMock,
  usePathname: jest.fn(() => '/'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

describe('PlayerCard', () => {
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

  beforeAll(() => {
    process.env.NEXT_PUBLIC_IPFS_GATEWAY = 'https://ipfs.example.com/ipfs';
  });

  beforeEach(() => {
    // Wipe the router push mock so each test starts with a fresh call
    // history. The refactored next/navigation mock returns the same
    // shared routerMock across renders, so without this reset
    // accumulated push() calls from earlier tests would leak into later
    // assertions.
    routerMock.push.mockClear();
  });

  it('renders the player name', () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(
      screen.getByRole('heading', { level: 3, name: mockPlayer.vitals.name }),
    ).toBeInTheDocument();
  });

  it('renders position and region in the details text', () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(
      screen.getByText(
        `${mockPlayer.vitals.position} · ${mockPlayer.vitals.region}`,
      ),
    ).toBeInTheDocument();
  });

  it('renders the progress level badge with the correct variant', () => {
    render(<PlayerCard player={mockPlayer} />);

    // Badge renders as <span role="status" ...>. PlayerCard passes an
    // explicit aria-label="Level ${progressLevel}: ${levelLabel}" that
    // gets spread via ...rest in components/ui/Badge.tsx, overriding
    // the component's own aria-label={label} attribute — so the
    // accessible name is "Level 2: Performance Milestones", not just
    // "Performance Milestones". Use getByRole so the Badge is selected
    // distinctly from ProgressBar's step-label <span> nodes inside the
    // progressbar, which also render the same "Performance Milestones"
    // text. The level 2 variant uses VARIANT_CLASSES.level2 =
    // 'bg-yellow-100 text-yellow-800' from components/ui/Badge.tsx.
    const badge = screen.getByRole('status', {
      name: `Level ${mockPlayer.progressLevel}: ${
        PROGRESS_LABELS[mockPlayer.progressLevel]
      }`,
    });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('text-yellow-800');
  });

  it('exposes the player profile route via the View Profile link', () => {
    render(<PlayerCard player={mockPlayer} />);

    // The View Profile link is intentionally decorated with
    // aria-hidden="true" + tabIndex={-1} because navigation is handled
    // by the parent <div role="article"> wrapper's click + keydown
    // handlers; the link is a visual cue only. With aria-hidden="true"
    // the link's accessible name is empty (not "View Profile"), so
    // searching by getByRole('link', { name: ... }) cannot find it
    // even with { hidden: true }. getByText matches the visible text
    // content directly and is unaffected by the aria-hidden attribute,
    // so it returns the right-hand <a> element.
    const viewProfileLink = screen.getByText('View Profile');
    expect(viewProfileLink).toHaveAttribute('href', `/player/${mockPlayer.id}`);
  });

  it('navigates to the player profile when Space is pressed on the card', () => {
    // PlayerCard's outer <div role="article"> wrapper registers a
    // keydown handler that calls router.push(`/player/${id}`) when the
    // key is ' ' (Space) or 'Enter'. Exercise the contract by firing
    // a real keydown event on the card and asserting router.push was
    // called with the profile route — this is the keyboard-navigation
    // contract the link's hidden { tabIndex: -1, aria-hidden: 'true' }
    // decoration transfers responsibility to.
    const { container } = render(<PlayerCard player={mockPlayer} />);
    const card = container.querySelector('[role="article"]') as HTMLElement;
    expect(card).not.toBeNull();

    fireEvent.keyDown(card, { key: ' ' });
    expect(routerMock.push).toHaveBeenCalledTimes(1);
    expect(routerMock.push).toHaveBeenCalledWith(`/player/${mockPlayer.id}`);
  });

  it('renders the player image when an IPFS hash is present', () => {
    render(<PlayerCard player={mockPlayer} />);

    // The avatar <Image> is wrapped in <div aria-hidden="true"> — the
    // parent <div role="article"> wrapper's aria-label is the primary
    // a11y signal for the card and the avatar is purely visual. Opt in
    // via { hidden: true } so the role query actually surfaces it.
    // Next.js's Image component transforms the raw IPFS gateway URL
    // into an internal /_next/image endpoint (e.g. /_next/image?url=
    // <encoded>&w=128&q=75) for runtime image optimization, so the
    // effective src is never byte-equal to the original. Assert the
    // encoded IPFS href is present in the resulting src rather than
    // relying on equality.
    const image = screen.getByRole('img', {
      name: mockPlayer.vitals.name,
      hidden: true,
    });
    expect(image).toBeInTheDocument();
    const src = image.getAttribute('src') ?? '';
    expect(src).toContain(
      encodeURIComponent(
        `${process.env.NEXT_PUBLIC_IPFS_GATEWAY}/${mockPlayer.ipfsHash}`,
      ),
    );
    expect(image).toHaveAttribute('alt', mockPlayer.vitals.name);
  });

  it('omits the avatar image when no IPFS image CID is set', () => {
    // The avatar block in PlayerCard.tsx renders the <Image> only
    // when ipfsHash is truthy, so an empty ipfsHash should produce no
    // img element under the avatar wrapper at all (and conversely,
    // no image is filtered from the a11y tree either).
    render(<PlayerCard player={{ ...mockPlayer, ipfsHash: '' }} />);

    expect(
      screen.queryByRole('img', {
        name: mockPlayer.vitals.name,
        hidden: true,
      }),
    ).not.toBeInTheDocument();
  });
});
