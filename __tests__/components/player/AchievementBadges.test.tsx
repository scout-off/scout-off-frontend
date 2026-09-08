import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AchievementBadges from '@/components/player/AchievementBadges';
import type { Player, Milestone } from '@/types';

// Tooltip creates a portal and relies on Popper/floating-ui positioning APIs
// that jsdom does not support. Stub it to render its children directly so
// badge labels remain queryable without positioning errors.
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

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    wallet: 'GWALLET1234567890',
    vitals: {
      name: 'Alex Osei',
      age: 22,
      position: 'ST',
      region: 'West Africa',
      nationality: 'Ghanaian',
    },
    stats: { goals: 15, assists: 7, appearances: 30 },
    ipfsHash: 'QmHighlight',
    progressLevel: 1,
    milestones: [],
    createdAt: 1_690_000_000,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AchievementBadges', () => {
  // ── Empty state ─────────────────────────────────────────────────────────

  it('renders nothing when the player has earned no badges', () => {
    // No milestones → no badge criteria met. Profile is also incomplete
    // (no ipfsHash, no stats) to avoid the profile_complete badge.
    const player = makePlayer({
      milestones: [],
      ipfsHash: '',
      stats: undefined,
      progressLevel: 0,
    });
    const { container } = render(<AchievementBadges player={player} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render the badge container when milestones array is empty', () => {
    const player = makePlayer({
      milestones: [],
      ipfsHash: '',
      stats: undefined,
    });
    render(<AchievementBadges player={player} />);
    expect(
      screen.queryByRole('generic', { name: /achievement badges/i }),
    ).not.toBeInTheDocument();
  });

  // ── first_milestone badge ────────────────────────────────────────────────

  it('renders the "First Milestone" badge when the player has one milestone', () => {
    const player = makePlayer({
      milestones: [makeMilestone({ id: 'm1' })],
      progressLevel: 1,
    });
    render(<AchievementBadges player={player} />);

    expect(screen.getByText('First Milestone')).toBeInTheDocument();
  });

  // ── milestone_collector badge (threshold = 5) ────────────────────────────

  it('renders "Milestone Collector" badge at 5 milestones', () => {
    const milestones = Array.from({ length: 5 }, (_, i) =>
      makeMilestone({ id: `m${i + 1}` }),
    );
    const player = makePlayer({ milestones, progressLevel: 2 });
    render(<AchievementBadges player={player} />);

    expect(screen.getByText('Milestone Collector')).toBeInTheDocument();
  });

  // ── milestone_master badge (threshold = 10) ──────────────────────────────

  it('renders "Milestone Master" badge at 10 milestones', () => {
    const milestones = Array.from({ length: 10 }, (_, i) =>
      makeMilestone({ id: `m${i + 1}` }),
    );
    const player = makePlayer({ milestones, progressLevel: 3 });
    render(<AchievementBadges player={player} />);

    expect(screen.getByText('Milestone Master')).toBeInTheDocument();
  });

  // ── profile_complete badge ───────────────────────────────────────────────

  it('renders "Profile Complete" badge when all vitals, stats, and ipfsHash are filled in', () => {
    const player = makePlayer({
      // makePlayer already sets all vitals, stats, and ipfsHash
      milestones: [],
    });
    render(<AchievementBadges player={player} />);

    expect(screen.getByText('Profile Complete')).toBeInTheDocument();
  });

  it('does not render "Profile Complete" badge when ipfsHash is missing', () => {
    const player = makePlayer({ ipfsHash: '', milestones: [] });
    render(<AchievementBadges player={player} />);

    expect(screen.queryByText('Profile Complete')).not.toBeInTheDocument();
  });

  // ── elite_tier badge ─────────────────────────────────────────────────────

  it('renders "Elite Tier" badge when progressLevel is 3', () => {
    const player = makePlayer({
      progressLevel: 3,
      milestones: [makeMilestone()],
    });
    render(<AchievementBadges player={player} />);

    expect(screen.getByText('Elite Tier')).toBeInTheDocument();
  });

  it('does not render "Elite Tier" badge when progressLevel is below 3', () => {
    const player = makePlayer({
      progressLevel: 2,
      milestones: [makeMilestone()],
    });
    render(<AchievementBadges player={player} />);

    expect(screen.queryByText('Elite Tier')).not.toBeInTheDocument();
  });

  // ── Representative multi-badge fixture ──────────────────────────────────

  it('renders the correct set of badges for a player with several milestones', () => {
    // 6 milestones → first_milestone + milestone_collector (not milestone_master)
    // Full profile → profile_complete
    // progressLevel 2 → no elite_tier
    const milestones = Array.from({ length: 6 }, (_, i) =>
      makeMilestone({ id: `m${i + 1}` }),
    );
    const player = makePlayer({ milestones, progressLevel: 2 });
    render(<AchievementBadges player={player} />);

    expect(screen.getByText('First Milestone')).toBeInTheDocument();
    expect(screen.getByText('Milestone Collector')).toBeInTheDocument();
    expect(screen.getByText('Profile Complete')).toBeInTheDocument();

    expect(screen.queryByText('Milestone Master')).not.toBeInTheDocument();
    expect(screen.queryByText('Elite Tier')).not.toBeInTheDocument();
  });

  // ── Container accessibility ──────────────────────────────────────────────

  it('renders the badge container with aria-label "Achievement badges"', () => {
    const player = makePlayer({ milestones: [makeMilestone()] });
    render(<AchievementBadges player={player} />);

    expect(
      screen.getByRole('generic', { name: 'Achievement badges' }),
    ).toBeInTheDocument();
  });

  // ── Tooltip wiring ───────────────────────────────────────────────────────

  it('wraps each badge in a Tooltip carrying the badge description', () => {
    const milestones = Array.from({ length: 5 }, (_, i) =>
      makeMilestone({ id: `m${i + 1}` }),
    );
    // profile complete + first_milestone + milestone_collector
    const player = makePlayer({ milestones, progressLevel: 1 });
    render(<AchievementBadges player={player} />);

    const tooltips = screen.getAllByTestId('tooltip');
    // Every rendered badge should have a Tooltip with a non-empty description
    tooltips.forEach((tooltip) => {
      expect(tooltip.getAttribute('data-content')).toBeTruthy();
    });
  });
});
