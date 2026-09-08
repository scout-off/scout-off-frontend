import { render, screen } from '@testing-library/react';
import LeaderboardContent from '@/app/[locale]/validator/leaderboard/LeaderboardContent';
import type { LeaderboardEntry } from '@/app/[locale]/validator/leaderboard/data';

const mockEntries: LeaderboardEntry[] = [
  {
    address: 'G123...abc',
    displayName: 'Validator One',
    isAcademy: false,
    approvalCount: 42,
    addedAt: 1234567890,
  },
  {
    address: 'G456...def',
    displayName: 'Academy Validator',
    isAcademy: true,
    approvalCount: 37,
    addedAt: 1234567891,
  },
];

describe('ValidatorLeaderboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the static shell', () => {
    render(
      <div>
        <h1>Validator Leaderboard</h1>
        <p>Anyone can view this page — no wallet connection required</p>
      </div>,
    );

    expect(screen.getByText('Validator Leaderboard')).toBeInTheDocument();
    expect(screen.getByText(/Anyone can view this page/)).toBeInTheDocument();
  });

  it('should render table rows when data is available', () => {
    render(<LeaderboardContent entries={mockEntries} />);

    // Non-academy validators show truncated address
    expect(screen.getByText('G123...abc')).toBeInTheDocument();
    expect(screen.getByText('Academy Validator')).toBeInTheDocument();

    // Use getAllByText since "42" appears twice (Approvals + Reputation)
    const fortyTwos = screen.getAllByText('42');
    expect(fortyTwos).toHaveLength(2);

    // Use getAllByText for 37 as well
    const thirtySevens = screen.getAllByText('37');
    expect(thirtySevens).toHaveLength(2);
  });

  it('should show empty state when no validators exist', () => {
    render(<LeaderboardContent entries={[]} />);
    expect(screen.getByText('No validators yet')).toBeInTheDocument();
  });

  it('should render back link', () => {
    render(<LeaderboardContent entries={mockEntries} />);
    expect(
      screen.getByText('← Back to Validator Dashboard'),
    ).toBeInTheDocument();
  });
});
