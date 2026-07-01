import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import MilestoneList from '@/components/player/MilestoneList';
import type { Milestone } from '@/types';

// ValidatorChip does its own async network/contract calls (checkIsValidator,
// fetchValidatorMilestoneCount) which are covered by its own test suite.
// Stub it here so MilestoneList tests stay focused on list rendering/sorting.
jest.mock('@/components/player/ValidatorChip', () => ({
  __esModule: true,
  default: ({ address }: { address: string }) => (
    <span data-testid="validator-chip">{address}</span>
  ),
}));

function makeMilestone(overrides: Partial<Milestone>): Milestone {
  return {
    id: 'm1',
    description: 'Scored a hat-trick',
    evidenceHash: 'QmEvidence',
    validator: 'GVALIDATORADDRESS1234567890',
    timestamp: 1_700_000_000,
    ...overrides,
  };
}

describe('MilestoneList', () => {
  it('renders the empty state when there are no milestones', () => {
    render(<MilestoneList milestones={[]} />);
    expect(screen.getByText('No milestones approved yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders a list item for each milestone', () => {
    const milestones = [
      makeMilestone({ id: 'm1', description: 'First milestone' }),
      makeMilestone({ id: 'm2', description: 'Second milestone' }),
    ];
    render(<MilestoneList milestones={milestones} />);

    const list = screen.getByRole('list', { name: 'Milestone history' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });

  it('sorts milestones chronologically (oldest first)', () => {
    const milestones = [
      makeMilestone({
        id: 'later',
        description: 'Later event',
        timestamp: 2_000_000_000,
      }),
      makeMilestone({
        id: 'earlier',
        description: 'Earlier event',
        timestamp: 1_000_000_000,
      }),
    ];
    render(<MilestoneList milestones={milestones} />);

    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('Earlier event')).toBeInTheDocument();
    expect(within(items[1]).getByText('Later event')).toBeInTheDocument();
  });

  it('does not mutate the original milestones array while sorting', () => {
    const milestones = [
      makeMilestone({ id: 'a', timestamp: 2_000_000_000 }),
      makeMilestone({ id: 'b', timestamp: 1_000_000_000 }),
    ];
    const original = [...milestones];
    render(<MilestoneList milestones={milestones} />);
    expect(milestones).toEqual(original);
  });

  it('assigns level1 badge to the first (oldest) milestone', () => {
    const milestones = [makeMilestone({ id: 'm1', timestamp: 1 })];
    render(<MilestoneList milestones={milestones} />);
    expect(screen.getByText('Verified Identity')).toBeInTheDocument();
  });

  it('assigns level2 badge to the second milestone', () => {
    const milestones = [
      makeMilestone({ id: 'm1', timestamp: 1 }),
      makeMilestone({ id: 'm2', timestamp: 2 }),
    ];
    render(<MilestoneList milestones={milestones} />);
    expect(screen.getByText('Verified Identity')).toBeInTheDocument();
    expect(screen.getByText('Performance Milestones')).toBeInTheDocument();
  });

  it('caps the badge level at 3 (Elite Tier) beyond the third milestone', () => {
    const milestones = [
      makeMilestone({ id: 'm1', timestamp: 1 }),
      makeMilestone({ id: 'm2', timestamp: 2 }),
      makeMilestone({ id: 'm3', timestamp: 3 }),
      makeMilestone({ id: 'm4', timestamp: 4 }),
    ];
    render(<MilestoneList milestones={milestones} />);
    const eliteTierBadges = screen.getAllByText('Elite Tier');
    // idx 2 (3rd milestone) AND idx 3 (4th milestone) both cap at level 3
    expect(eliteTierBadges).toHaveLength(2);
  });

  it('renders the milestone description and a ValidatorChip per row', () => {
    const milestones = [
      makeMilestone({
        id: 'm1',
        description: 'Won regional tournament',
        validator: 'GVALIDATOR999',
      }),
    ];
    render(<MilestoneList milestones={milestones} />);
    expect(screen.getByText('Won regional tournament')).toBeInTheDocument();
    expect(screen.getByTestId('validator-chip')).toHaveTextContent(
      'GVALIDATOR999',
    );
  });

  it('renders a formatted, human-readable date for each milestone', () => {
    const milestones = [makeMilestone({ id: 'm1', timestamp: 1_700000000 })];
    render(<MilestoneList milestones={milestones} />);
    const expected = new Date(1_700000000 * 1000).toLocaleDateString(
      undefined,
      { year: 'numeric', month: 'short', day: 'numeric' },
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
