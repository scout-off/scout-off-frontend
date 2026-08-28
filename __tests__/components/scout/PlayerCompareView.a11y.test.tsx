import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import PlayerCompareView from '@/components/scout/PlayerCompareView';
import type { Player } from '@/types';

expect.extend(toHaveNoViolations);

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
// ValidatorChip, animated nodes). Stub it here so tests stay focused on
// the comparison layout rather than timeline internals.
jest.mock('@/components/player/MilestoneTimeline', () => ({
  __esModule: true,
  default: ({
    milestones,
  }: {
    milestones: Player[];
    currentLevel: number;
  }) => (
    <div data-testid="milestone-timeline">
      {milestones.length} milestone(s)
    </div>
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
    stats: { goals: playerCounter * 5, assists: playerCounter * 2, appearances: 30 },
    ipfsHash: '',
    progressLevel: 1,
    milestones: [],
    createdAt: 1_690_000_000,
    ...overrides,
  };
}

beforeEach(() => {
  playerCounter = 0;
});

describe('PlayerCompareView – accessibility', () => {
  it('has no axe violations when showing multiple players', async () => {
    const players = [makePlayer(), makePlayer(), makePlayer()];
    const { container } = render(<PlayerCompareView players={players} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations when showing a single player', async () => {
    const { container } = render(<PlayerCompareView players={[makePlayer()]} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations when showing no players (empty state)', async () => {
    const { container } = render(<PlayerCompareView players={[]} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('renders each player in their own section with proper heading', () => {
    const players = [makePlayer({ vitals: { name: 'Alpha' } })];
    render(<PlayerCompareView players={players} />);

    const playerSection = screen.getByRole('region', { name: 'Player vitals' });
    expect(playerSection).toBeInTheDocument();

    const nameHeading = screen.getByRole('heading', { name: 'Alpha', level: 3 });
    expect(nameHeading).toBeInTheDocument();
  });

  it('renders the players in a grid layout', () => {
    const players = [makePlayer(), makePlayer(), makePlayer(), makePlayer()];
    render(<PlayerCompareView players={players} />);

    const grid = screen.getByRole('group').parentElement;
    // The grid is the parent container with grid class
    expect(grid?.className).toContain('grid');
    // Check for responsive grid columns
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('md:grid-cols-2');
    expect(grid?.className).toContain('lg:grid-cols-3');
    expect(grid?.className).toContain('xl:grid-cols-4');
  });
});
