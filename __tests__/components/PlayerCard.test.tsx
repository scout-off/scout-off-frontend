import React from 'react';
import { render, screen } from '@testing-library/react';
import PlayerCard from '@/components/PlayerCard';
import type { Player } from '@/types';

const mockPlayer: Player = {
  id: '1',
  wallet: 'GTESTWALLET',
  vitals: {
    name: 'Test Player',
    age: 25,
    position: 'ST',
    region: 'Europe',
    nationality: 'England',
  },
  ipfsHash: 'test-hash',
  progressLevel: 0,
  milestones: [],
  createdAt: 1234567890,
};

describe('PlayerCard', () => {
  it('renders player information correctly', () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(screen.getByText('Test Player')).toBeInTheDocument();
    expect(screen.getByText('ST · Europe')).toBeInTheDocument();
  });

  it('does not show Elite Tier badge for level 0', () => {
    render(<PlayerCard player={{ ...mockPlayer, progressLevel: 0 }} />);
    expect(screen.queryByText('Elite Tier')).not.toBeInTheDocument();
  });

  it('does not show Elite Tier badge for level 1', () => {
    render(<PlayerCard player={{ ...mockPlayer, progressLevel: 1 }} />);
    expect(screen.queryByText('Elite Tier')).not.toBeInTheDocument();
  });

  it('does not show Elite Tier badge for level 2', () => {
    render(<PlayerCard player={{ ...mockPlayer, progressLevel: 2 }} />);
    expect(screen.queryByText('Elite Tier')).not.toBeInTheDocument();
  });

  it('shows Elite Tier badge for level 3', () => {
    render(<PlayerCard player={{ ...mockPlayer, progressLevel: 3 }} />);
    expect(screen.getByText('Elite Tier')).toBeInTheDocument();
  });
});
