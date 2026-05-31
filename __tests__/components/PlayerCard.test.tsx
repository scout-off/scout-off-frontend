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

jest.mock('next/navigation', () => ({
  __esModule: true,
  useRouter: jest.fn(() => ({ push: jest.fn() })),
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

    const progressLabel = screen.getByText(
      PROGRESS_LABELS[mockPlayer.progressLevel],
    );

    expect(progressLabel).toBeInTheDocument();
    expect(progressLabel).toHaveClass('text-brand-green');
  });

  it('links to the correct player id and handles click behavior', () => {
    render(<PlayerCard player={mockPlayer} />);

    const viewProfileLink = screen.getByRole('link', { name: /view profile/i });

    expect(viewProfileLink).toHaveAttribute('href', `/player/${mockPlayer.id}`);

    fireEvent.click(viewProfileLink);

    expect(viewProfileLink).toHaveAttribute('href', `/player/${mockPlayer.id}`);
  });

  it('renders the player image when an IPFS hash is present', () => {
    render(<PlayerCard player={mockPlayer} />);

    const image = screen.getByRole('img', { name: mockPlayer.vitals.name });

    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute(
      'src',
      `${process.env.NEXT_PUBLIC_IPFS_GATEWAY}/${mockPlayer.ipfsHash}`,
    );
  });

  it('shows a placeholder when no IPFS image CID is set', () => {
    render(<PlayerCard player={{ ...mockPlayer, ipfsHash: '' }} />);

    expect(
      screen.queryByRole('img', { name: mockPlayer.vitals.name }),
    ).not.toBeInTheDocument();
  });
});
