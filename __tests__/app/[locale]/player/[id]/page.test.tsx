import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── Hook mocks ────────────────────────────────────────────────────────────────

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: 'player-1' })),
}));

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(() => ({ publicKey: null })),
}));

jest.mock('@/hooks/usePlayer', () => ({
  usePlayer: jest.fn(),
}));

jest.mock('@/hooks/usePayToContact', () => ({
  usePayToContact: jest.fn(() => ({ unlock: jest.fn(), loading: false })),
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: jest.fn(() => ({
    subscription: null,
    isExpired: false,
    loading: false,
  })),
}));

// ── Component mocks ───────────────────────────────────────────────────────────

jest.mock('@/components/PlayerProfileSkeleton', () => ({
  __esModule: true,
  default: () => <div data-testid="skeleton" />,
}));

jest.mock('@/components/ProgressBar', () => ({
  __esModule: true,
  default: ({ level }: { level: number }) => (
    <div data-testid="progress-bar">level:{level}</div>
  ),
}));

jest.mock('@/components/player/PlayerStatsCard', () => ({
  __esModule: true,
  default: () => <div data-testid="stats-card" />,
}));

jest.mock('@/components/player/IPFSMediaGallery', () => ({
  __esModule: true,
  default: ({ cids }: { cids: string[] }) => (
    <div data-testid="ipfs-gallery" data-cids={cids.join(',')} />
  ),
}));

jest.mock('@/components/scout/TrialOfferForm', () => ({
  __esModule: true,
  default: () => <div data-testid="trial-offer-form" />,
}));

jest.mock('@/components/ui/Button', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}));

jest.mock('@/components/ui/ConfirmDialog', () => ({
  __esModule: true,
  default: () => <div data-testid="confirm-dialog" />,
}));

jest.mock('@/components/ui/QRModal', () => ({
  __esModule: true,
  default: () => <div data-testid="qr-modal" />,
}));

jest.mock('@/lib/contract', () => ({
  PLATFORM_CONTACT_FEE_XLM: 1,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import PlayerProfile from '@/app/[locale]/player/[id]/page';
import { usePlayer } from '@/hooks/usePlayer';

const mockUsePlayer = usePlayer as jest.Mock;

const basePlayer = {
  id: 'player-1',
  wallet: 'GABC123XYZ',
  vitals: {
    name: 'Test Player',
    age: 22,
    position: 'ST',
    region: 'West Africa',
    nationality: 'GH',
  },
  stats: { goals: 10, assists: 5, appearances: 20 },
  ipfsHash: 'QmTestHash123',
  progressLevel: 1 as const,
  milestones: [],
  createdAt: 1700000000,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PlayerProfile page', () => {
  it('shows skeleton while loading', () => {
    mockUsePlayer.mockReturnValue({
      player: null,
      loading: true,
      refetch: jest.fn(),
    });
    render(<PlayerProfile />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('shows not-found message when player is null', () => {
    mockUsePlayer.mockReturnValue({
      player: null,
      loading: false,
      refetch: jest.fn(),
    });
    render(<PlayerProfile />);
    expect(screen.getByText('Player not found.')).toBeInTheDocument();
  });

  it('renders player name and vitals', () => {
    mockUsePlayer.mockReturnValue({
      player: basePlayer,
      loading: false,
      refetch: jest.fn(),
    });
    render(<PlayerProfile />);
    expect(screen.getByText('Test Player')).toBeInTheDocument();
    expect(screen.getByText(/ST · West Africa · Age 22/)).toBeInTheDocument();
  });

  it('renders IPFSMediaGallery with the player ipfsHash', () => {
    mockUsePlayer.mockReturnValue({
      player: basePlayer,
      loading: false,
      refetch: jest.fn(),
    });
    render(<PlayerProfile />);
    const gallery = screen.getByTestId('ipfs-gallery');
    expect(gallery).toBeInTheDocument();
    expect(gallery).toHaveAttribute('data-cids', 'QmTestHash123');
  });

  it('renders IPFSMediaGallery with empty cids when ipfsHash is empty string', () => {
    mockUsePlayer.mockReturnValue({
      player: { ...basePlayer, ipfsHash: '' },
      loading: false,
      refetch: jest.fn(),
    });
    render(<PlayerProfile />);
    const gallery = screen.getByTestId('ipfs-gallery');
    expect(gallery).toHaveAttribute('data-cids', '');
  });

  it('renders IPFSMediaGallery with empty cids when ipfsHash is undefined', () => {
    mockUsePlayer.mockReturnValue({
      player: { ...basePlayer, ipfsHash: undefined as unknown as string },
      loading: false,
      refetch: jest.fn(),
    });
    render(<PlayerProfile />);
    const gallery = screen.getByTestId('ipfs-gallery');
    expect(gallery).toHaveAttribute('data-cids', '');
  });

  it('shows "no milestones" message when milestones is empty', () => {
    mockUsePlayer.mockReturnValue({
      player: basePlayer,
      loading: false,
      refetch: jest.fn(),
    });
    render(<PlayerProfile />);
    expect(screen.getByText('No milestones recorded yet.')).toBeInTheDocument();
  });

  it('renders milestones when present', () => {
    const player = {
      ...basePlayer,
      milestones: [
        {
          id: 'm1',
          description: 'Scored 5 goals',
          evidenceHash: '',
          validator: 'GVALIDATOR123456',
          timestamp: 1700000000,
        },
      ],
    };
    mockUsePlayer.mockReturnValue({
      player,
      loading: false,
      refetch: jest.fn(),
    });
    render(<PlayerProfile />);
    expect(screen.getByText('Scored 5 goals')).toBeInTheDocument();
  });

  it('does not render pay-to-contact button when no wallet connected', () => {
    mockUsePlayer.mockReturnValue({
      player: basePlayer,
      loading: false,
      refetch: jest.fn(),
    });
    render(<PlayerProfile />);
    expect(screen.queryByText(/Pay to Contact/)).not.toBeInTheDocument();
  });
});

// ── No hardcoded gateway URLs ─────────────────────────────────────────────────

describe('No hardcoded IPFS gateway URLs', () => {
  it('page source does not contain hardcoded ipfs.io or pinata gateway URLs', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/[locale]/player/[id]/page.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/https:\/\/ipfs\.io/);
    expect(src).not.toMatch(/https:\/\/gateway\.pinata\.cloud/);
  });
});
