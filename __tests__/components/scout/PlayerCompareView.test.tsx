import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerCompareView from '@/components/scout/PlayerCompareView';
import type { Player, Milestone } from '@/types';

// next/image triggers a complex loader in jsdom. Replace with a plain <img>
// so avatar rendering tests work without Next.js internals.
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    width,
    height,
    ...rest
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    [key: string]: unknown;
  }) => <img src={src} alt={alt} width={width} height={height} {...rest} />,
}));

// MilestoneTimeline contains heavy interactive/positioning logic (Popper,
// ValidatorChip, animated nodes). Stub it here so PlayerCompareView tests
// stay focused on the comparison layout rather than timeline internals.
jest.mock('@/components/player/MilestoneTimeline', () => ({
  __esModule: true,
  default: ({
    milestones,
  }: {
    milestones: Milestone[];
    currentLevel: number;
  }) => (
    <div data-testid="milestone-timeline">{milestones.length} milestone(s)</div>
  ),
}));

// Tooltip uses Popper positioning which jsdom cannot resolve; render children inline.
jest.mock('@/components/ui/Tooltip', () => ({
  __esModule: true,
  default: ({
    children,
    content,
  }: {
    children: React.ReactNode;
    content: string;
  }) => (
    <span data-testid="tooltip" data-content={content}>
      {children}
    </span>
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'm1',
    description: 'KYC verified',
    evidenceHash: 'QmEvidence',
    validator: 'GVALIDATOR1234567890',
    timestamp: 1_700_000_000,
    ...overrides,
  };
}

let playerCounter = 0;
function makePlayer(overrides: Partial<Player> = {}): Player {
  playerCounter += 1;
  return {
    id: `player-${playerCounter}`,
    wallet: `GWALLET${playerCounter}`,
    vitals: {
      name: `Player ${playerCounter}`,
      age: 20 + playerCounter,
      position: 'ST',
      region: 'West Africa',
      nationality: 'Ghanaian',
    },
    stats: {
      goals: playerCounter * 5,
      assists: playerCounter * 2,
      appearances: 30,
    },
    ipfsHash: '',
    progressLevel: 1,
    milestones: [],
    createdAt: 1_690_000_000,
    ...overrides,
  };
}

beforeEach(() => {
  // Reset counter so player names are stable across tests.
  playerCounter = 0;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PlayerCompareView', () => {
  // ── Empty / no players selected state ───────────────────────────────────

  it('renders an empty grid when no players are provided', () => {
    const { container } = render(<PlayerCompareView players={[]} />);
    // The wrapping grid div is present but contains no columns.
    expect(container.querySelector('.grid')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /vitals/i }),
    ).not.toBeInTheDocument();
  });

  // ── Loading state ────────────────────────────────────────────────────────
  // PlayerCompareView itself is presentational; loading state is owned by the
  // parent page (which uses useComparePlayers). Simulate it by passing an
  // empty array, which is what the page renders while data is in-flight.

  it('renders no player columns when the players array is empty (loading/pre-selection state)', () => {
    render(<PlayerCompareView players={[]} />);

    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  // ── Single player ────────────────────────────────────────────────────────

  it('renders a single column with the player name and vitals', () => {
    const player = makePlayer({
      vitals: {
        name: 'Kofi Mensah',
        age: 23,
        position: 'CM',
        region: 'East Africa',
        nationality: 'Kenyan',
      },
    });
    render(<PlayerCompareView players={[player]} />);

    expect(
      screen.getByRole('heading', { name: 'Kofi Mensah', level: 3 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Player vitals/i }),
    ).toBeInTheDocument();
  });

  // ── Multiple players side by side ────────────────────────────────────────

  it('renders one column per player when multiple players are supplied', () => {
    const players = [
      makePlayer({
        vitals: {
          name: 'Alpha',
          age: 20,
          position: 'ST',
          region: 'West Africa',
          nationality: 'Ghanaian',
        },
      }),
      makePlayer({
        vitals: {
          name: 'Beta',
          age: 22,
          position: 'GK',
          region: 'North Africa',
          nationality: 'Egyptian',
        },
      }),
      makePlayer({
        vitals: {
          name: 'Gamma',
          age: 19,
          position: 'CB',
          region: 'Southern Africa',
          nationality: 'South African',
        },
      }),
    ];
    render(<PlayerCompareView players={players} />);

    expect(
      screen.getByRole('heading', { name: 'Alpha', level: 3 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Beta', level: 3 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Gamma', level: 3 }),
    ).toBeInTheDocument();
  });

  it('renders a vitals section for each player', () => {
    const players = [makePlayer(), makePlayer()];
    render(<PlayerCompareView players={players} />);

    expect(
      screen.getAllByRole('region', { name: /Player vitals/i }),
    ).toHaveLength(2);
  });

  it('shows the correct age, position, region, and nationality for each player', () => {
    const players = [
      makePlayer({
        vitals: {
          name: 'Amara',
          age: 21,
          position: 'LW',
          region: 'West Africa',
          nationality: 'Senegalese',
        },
      }),
      makePlayer({
        vitals: {
          name: 'Tunde',
          age: 25,
          position: 'CB',
          region: 'West Africa',
          nationality: 'Nigerian',
        },
      }),
    ];
    render(<PlayerCompareView players={players} />);

    // Each player's vitals should appear in their column.
    const vitalsRegions = screen.getAllByRole('region', {
      name: /Player vitals/i,
    });
    expect(within(vitalsRegions[0]).getByText('21')).toBeInTheDocument();
    expect(
      within(vitalsRegions[0]).getByText('Senegalese'),
    ).toBeInTheDocument();
    expect(within(vitalsRegions[1]).getByText('25')).toBeInTheDocument();
    expect(within(vitalsRegions[1]).getByText('Nigerian')).toBeInTheDocument();
  });

  it('renders the stats section when a player has stats', () => {
    const player = makePlayer({
      stats: { goals: 12, assists: 4, appearances: 25 },
    });
    render(<PlayerCompareView players={[player]} />);

    expect(
      screen.getByRole('region', { name: /Player stats/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('omits the stats section when a player has no stats', () => {
    const player = makePlayer({ stats: undefined });
    render(<PlayerCompareView players={[player]} />);

    expect(
      screen.queryByRole('region', { name: /Player stats/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the milestone count and a MilestoneTimeline for each player', () => {
    const milestones = [
      makeMilestone({ id: 'm1' }),
      makeMilestone({ id: 'm2' }),
    ];
    const player = makePlayer({ milestones, progressLevel: 2 });
    render(<PlayerCompareView players={[player]} />);

    expect(
      screen.getByRole('region', { name: /[-–] Milestones/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 milestones')).toBeInTheDocument();
    expect(screen.getByTestId('milestone-timeline')).toBeInTheDocument();
  });

  it('uses the singular "milestone" label when a player has exactly 1 milestone', () => {
    const player = makePlayer({
      milestones: [makeMilestone()],
      progressLevel: 1,
    });
    render(<PlayerCompareView players={[player]} />);

    expect(screen.getByText('1 milestone')).toBeInTheDocument();
  });

  it('renders a progress section with a progressbar for each player', () => {
    const players = [makePlayer(), makePlayer()];
    render(<PlayerCompareView players={players} />);

    expect(
      screen.getAllByRole('region', { name: /Progress level/i }),
    ).toHaveLength(2);
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
  });

  it('renders an avatar image when a player has an ipfsHash', () => {
    const player = makePlayer({
      vitals: {
        name: 'With Avatar',
        age: 22,
        position: 'ST',
        region: 'r',
        nationality: 'n',
      },
      ipfsHash: 'QmAvatarCid',
    });
    const { container } = render(<PlayerCompareView players={[player]} />);

    // The avatar wrapper is aria-hidden (the name is announced via the h3),
    // so query the DOM directly rather than by role.
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt', 'With Avatar');
    expect(img?.getAttribute('src')).toContain('QmAvatarCid');
  });

  it('does not render an avatar image when ipfsHash is empty', () => {
    const player = makePlayer({
      vitals: {
        name: 'No Avatar',
        age: 20,
        position: 'ST',
        region: 'r',
        nationality: 'n',
      },
      ipfsHash: '',
    });
    const { container } = render(<PlayerCompareView players={[player]} />);

    expect(container.querySelector('img')).not.toBeInTheDocument();
  });
});
