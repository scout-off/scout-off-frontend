import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { Scout } from '@/types';
import ScoutProfileCard from '@/components/scout/ScoutProfileCard';

// Track how many times the Link inside ScoutProfileCard renders.
// When memo bails out, React skips the component function entirely, so none of
// its children (including Link) render — making this a reliable render counter.
const mockLink = jest.fn(
  ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
);

jest.mock('next/link', () => ({
  __esModule: true,
  default: (props: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => mockLink(props),
}));

// Use a never-resolving promise so ScoutProfileCard's async state update never
// fires mid-test, avoiding spurious act() warnings in non-async tests.
jest.mock('@/lib/api', () => ({
  fetchScoutStats: jest.fn().mockImplementation(() => new Promise(() => {})),
}));

const FUTURE_EXPIRY = Math.floor(Date.now() / 1000) + 86_400 * 30;

const mockScout: Scout = {
  id: 'scout-1',
  wallet: 'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV',
  name: 'Jane Scout',
  organisation: 'Elite FC',
  subscriptionTier: 'pro',
  subscriptionExpiry: FUTURE_EXPIRY,
  contactedPlayers: [],
};

beforeEach(() => {
  mockLink.mockClear();
});

describe('ScoutProfileCard', () => {
  it('is exported as a React.memo component', () => {
    expect((ScoutProfileCard as any).$$typeof).toBe(
      Symbol.for('react.memo'),
    );
  });

  it('renders scout name, organisation, and tier badge', () => {
    render(<ScoutProfileCard scout={mockScout} />);
    expect(screen.getByText('Jane Scout')).toBeInTheDocument();
    expect(screen.getByText('Elite FC')).toBeInTheDocument();
    expect(screen.getByText('pro')).toBeInTheDocument();
  });

  it('renders the truncated wallet address', () => {
    render(<ScoutProfileCard scout={mockScout} />);
    expect(screen.getByText('GCFW7Q…G5OV')).toBeInTheDocument();
  });

  it('does not re-render when unrelated parent state changes', async () => {
    // Parent holds a filter query that has nothing to do with the scout data.
    // Typing into the input triggers multiple re-renders of the parent, but
    // ScoutProfileCard's memo comparator should block all of them.
    function Parent() {
      const [query, setQuery] = useState('');
      return (
        <>
          <input
            data-testid="unrelated-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ScoutProfileCard scout={mockScout} />
        </>
      );
    }

    render(<Parent />);

    // One call on initial mount; reset before triggering parent updates.
    expect(mockLink).toHaveBeenCalledTimes(1);
    mockLink.mockClear();

    // Trigger several unrelated parent re-renders.
    const input = screen.getByTestId('unrelated-input');
    await userEvent.type(input, 'hello');

    // Link should have been called 0 additional times — memo blocked every
    // re-render of ScoutProfileCard triggered by the parent's query state.
    expect(mockLink).toHaveBeenCalledTimes(0);
  });

  it('does re-render when a displayed prop changes', async () => {
    const { rerender } = render(<ScoutProfileCard scout={mockScout} />);
    expect(mockLink).toHaveBeenCalledTimes(1);

    rerender(
      <ScoutProfileCard scout={{ ...mockScout, name: 'Updated Name' }} />,
    );

    // name changed → memo allows re-render → Link is called again.
    expect(mockLink).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Updated Name')).toBeInTheDocument();
  });

  it('does not re-render when only contactedPlayers (unused) changes', () => {
    const { rerender } = render(<ScoutProfileCard scout={mockScout} />);
    expect(mockLink).toHaveBeenCalledTimes(1);

    rerender(
      <ScoutProfileCard
        scout={{ ...mockScout, contactedPlayers: ['player-99'] }}
      />,
    );

    // contactedPlayers is not rendered, so memo should block re-render.
    expect(mockLink).toHaveBeenCalledTimes(1);
  });
});

describe('ScoutProfileCard memo comparator', () => {
  const fields: Array<keyof Scout> = [
    'name',
    'organisation',
    'wallet',
    'subscriptionTier',
  ];

  fields.forEach((field) => {
    it(`re-renders when ${field} changes`, () => {
      const { rerender } = render(<ScoutProfileCard scout={mockScout} />);
      const before = mockLink.mock.calls.length;

      const updated = {
        ...mockScout,
        [field]: field === 'subscriptionTier' ? 'elite' : `changed-${field}`,
      } as Scout;
      rerender(<ScoutProfileCard scout={updated} />);

      expect(mockLink.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('re-renders when subscriptionExpiry changes', () => {
    const { rerender } = render(<ScoutProfileCard scout={mockScout} />);
    const before = mockLink.mock.calls.length;

    rerender(
      <ScoutProfileCard
        scout={{ ...mockScout, subscriptionExpiry: FUTURE_EXPIRY + 1000 }}
      />,
    );

    expect(mockLink.mock.calls.length).toBeGreaterThan(before);
  });
});
