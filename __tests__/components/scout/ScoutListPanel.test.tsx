import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Scout } from '@/types';
import ScoutListPanel from '@/components/scout/ScoutListPanel';

jest.mock('@/components/scout/ScoutProfileCard', () => ({
  __esModule: true,
  default: ({ scout }: { scout: Scout }) => (
    <div data-testid="scout-card">{scout.name}</div>
  ),
}));

function makeScout(overrides: Partial<Scout> = {}): Scout {
  return {
    id: 'scout-1',
    wallet: 'GABC',
    name: 'Jane Scout',
    organisation: 'Acme FC',
    subscriptionTier: 'basic',
    subscriptionExpiry: 0,
    contactedPlayers: [],
    ...overrides,
  };
}

describe('ScoutListPanel', () => {
  it('renders a card for every scout when no filter is applied', () => {
    const scouts = [
      makeScout({ id: '1', name: 'Basic Scout', subscriptionTier: 'basic' }),
      makeScout({ id: '2', name: 'Pro Scout', subscriptionTier: 'pro' }),
    ];
    render(<ScoutListPanel scouts={scouts} />);

    expect(screen.getAllByTestId('scout-card')).toHaveLength(2);
  });

  it('shows an empty message when there are no scouts', () => {
    render(<ScoutListPanel scouts={[]} />);

    expect(
      screen.getByText('No scouts match this filter.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('scout-card')).not.toBeInTheDocument();
  });

  it('filters scouts by the selected subscription tier', async () => {
    const user = userEvent.setup();
    const scouts = [
      makeScout({ id: '1', name: 'Basic Scout', subscriptionTier: 'basic' }),
      makeScout({ id: '2', name: 'Pro Scout', subscriptionTier: 'pro' }),
      makeScout({ id: '3', name: 'Elite Scout', subscriptionTier: 'elite' }),
    ];
    render(<ScoutListPanel scouts={scouts} />);

    await user.selectOptions(screen.getByLabelText('Filter by tier'), 'pro');

    expect(screen.getByText('Pro Scout')).toBeInTheDocument();
    expect(screen.queryByText('Basic Scout')).not.toBeInTheDocument();
    expect(screen.queryByText('Elite Scout')).not.toBeInTheDocument();
  });

  it('shows the empty message when the filter matches nothing', async () => {
    const user = userEvent.setup();
    const scouts = [
      makeScout({ id: '1', name: 'Basic Scout', subscriptionTier: 'basic' }),
    ];
    render(<ScoutListPanel scouts={scouts} />);

    await user.selectOptions(screen.getByLabelText('Filter by tier'), 'elite');

    expect(
      screen.getByText('No scouts match this filter.'),
    ).toBeInTheDocument();
  });
});
