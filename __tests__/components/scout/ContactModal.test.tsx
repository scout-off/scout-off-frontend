import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUsePayToContact = jest.fn();

jest.mock('@/hooks/usePayToContact', () => ({
  usePayToContact: (...args: unknown[]) => mockUsePayToContact(...args),
}));

import ContactModal from '@/components/scout/ContactModal';

const PLAYER_ID = 'player-123';

function setHook(
  overrides: {
    unlock?: { contactDetails?: Record<string, string | undefined> };
    loading?: boolean;
    error?: { code?: number; message?: string } | null;
  } = {},
) {
  mockUsePayToContact.mockReturnValue({
    unlock: undefined,
    loading: false,
    error: null,
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setHook();
});

describe('ContactModal', () => {
  it('renders nothing when isOpen is false', () => {
    render(
      <ContactModal isOpen={false} onClose={jest.fn()} playerId={PLAYER_ID} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('passes the playerId through to the hook', () => {
    render(<ContactModal isOpen onClose={jest.fn()} playerId={PLAYER_ID} />);
    expect(mockUsePayToContact).toHaveBeenCalledWith(PLAYER_ID);
  });

  it('shows a spinner while loading', () => {
    setHook({ loading: true });
    render(<ContactModal isOpen onClose={jest.fn()} playerId={PLAYER_ID} />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders contact details with copy buttons for each present field', async () => {
    const user = userEvent.setup();
    const writeTextSpy = jest
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    setHook({
      unlock: {
        contactDetails: {
          email: 'scout@example.com',
          phone: '+123456789',
          telegram: '@scoutguy',
        },
      },
    });
    render(<ContactModal isOpen onClose={jest.fn()} playerId={PLAYER_ID} />);

    expect(screen.getByText('Email: scout@example.com')).toBeInTheDocument();
    expect(screen.getByText('Phone: +123456789')).toBeInTheDocument();
    expect(screen.getByText('Telegram: @scoutguy')).toBeInTheDocument();

    const copyButtons = screen.getAllByRole('button', { name: 'Copy' });
    expect(copyButtons).toHaveLength(3);

    await user.click(copyButtons[0]);
    expect(writeTextSpy).toHaveBeenCalledWith('scout@example.com');
  });

  it('only renders rows for contact fields that are present', () => {
    setHook({
      unlock: { contactDetails: { email: 'only@example.com' } },
    });
    render(<ContactModal isOpen onClose={jest.fn()} playerId={PLAYER_ID} />);

    expect(screen.getByText('Email: only@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/^Phone:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Telegram:/)).not.toBeInTheDocument();
  });

  it('maps a known contract error code to a human-readable message', () => {
    setHook({ error: { code: 7 } });
    render(<ContactModal isOpen onClose={jest.fn()} playerId={PLAYER_ID} />);

    expect(
      screen.getByText('Insufficient XLM balance to pay the contact fee.'),
    ).toBeInTheDocument();
  });

  it('maps the subscription-expired error code', () => {
    setHook({ error: { code: 8 } });
    render(<ContactModal isOpen onClose={jest.fn()} playerId={PLAYER_ID} />);

    expect(
      screen.getByText('Your scout subscription has expired. Please renew.'),
    ).toBeInTheDocument();
  });

  it('falls back to the raw error message when no code is present', () => {
    setHook({ error: { message: 'Unexpected failure occurred.' } });
    render(<ContactModal isOpen onClose={jest.fn()} playerId={PLAYER_ID} />);

    expect(
      screen.getByText('Unexpected failure occurred.'),
    ).toBeInTheDocument();
  });

  it('does not render contact details while still loading', () => {
    setHook({
      loading: true,
      unlock: { contactDetails: { email: 'scout@example.com' } },
    });
    render(<ContactModal isOpen onClose={jest.fn()} playerId={PLAYER_ID} />);

    expect(screen.queryByText(/^Email:/)).not.toBeInTheDocument();
  });

  it('calls onClose when the modal close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<ContactModal isOpen onClose={onClose} playerId={PLAYER_ID} />);

    await user.click(screen.getByRole('button', { name: 'Close modal' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
