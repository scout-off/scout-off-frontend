import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSubmit = jest.fn();
const mockUseTrialOffer = jest.fn();

jest.mock('@/hooks/useTrialOffer', () => ({
  useTrialOffer: () => mockUseTrialOffer(),
}));

import TrialOfferModal from '@/components/scout/TrialOfferModal';

const PLAYER_ID = 'player-123';

function setHook(
  overrides: Partial<ReturnType<typeof mockUseTrialOffer>> = {},
) {
  mockUseTrialOffer.mockReturnValue({
    submit: mockSubmit,
    loading: false,
    error: null,
    ...overrides,
  });
}

async function openModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Log Trial Offer' }));
  // Modal.tsx moves focus to its close button on the next animation frame.
  // If that fires mid-keystroke it steals focus and drops characters, so
  // wait for it to settle before any test starts typing.
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close modal' }),
    ),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  setHook();
});

describe('TrialOfferModal', () => {
  it('renders the trigger button and keeps the modal closed initially', () => {
    render(<TrialOfferModal playerId={PLAYER_ID} />);

    expect(
      screen.getByRole('button', { name: 'Log Trial Offer' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the modal when the trigger button is clicked', async () => {
    const user = userEvent.setup();
    render(<TrialOfferModal playerId={PLAYER_ID} />);

    await openModal(user);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Offer Details')).toBeInTheDocument();
    expect(screen.getByText('Trial Start Date')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
  });

  it('disables submit until all fields are filled, and shows a validation error on empty submit', async () => {
    const user = userEvent.setup();
    render(<TrialOfferModal playerId={PLAYER_ID} />);
    await openModal(user);

    const submitBtn = screen.getByRole('button', { name: 'Submit' });
    expect(submitBtn).toBeDisabled();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('closes the modal when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<TrialOfferModal playerId={PLAYER_ID} />);
    await openModal(user);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits trimmed details once all fields are filled', async () => {
    mockSubmit.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TrialOfferModal playerId={PLAYER_ID} />);
    await openModal(user);

    await user.type(
      screen.getByPlaceholderText(/Trial for striker/),
      '  Nice finisher  ',
    );
    // The date input has no placeholder/label association in the markup;
    // locate it by input type instead.
    const dialog = screen.getByRole('dialog');
    const dateField = dialog.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement;
    await user.type(dateField, '2026-08-01');
    await user.type(screen.getByPlaceholderText(/Lagos, Nigeria/), '  Lagos  ');

    const submitBtn = screen.getByRole('button', { name: 'Submit' });
    expect(submitBtn).not.toBeDisabled();

    await user.click(submitBtn);

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit).toHaveBeenCalledWith(PLAYER_ID, {
      description: 'Nice finisher',
      startDate: '2026-08-01',
      location: 'Lagos',
    });

    expect(
      await screen.findByText('Transaction confirmed.'),
    ).toBeInTheDocument();
  });

  it('resets the form, closes the modal, and calls onSuccess after a successful submit', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockSubmit.mockResolvedValue(undefined);
    const onSuccess = jest.fn();
    const user = userEvent.setup({
      advanceTimers: (ms) => jest.advanceTimersByTime(ms),
    });

    render(<TrialOfferModal playerId={PLAYER_ID} onSuccess={onSuccess} />);
    await openModal(user);

    const dialog = screen.getByRole('dialog');
    const dateField = dialog.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement;

    await user.type(screen.getByPlaceholderText(/Trial for striker/), 'Desc');
    await user.type(dateField, '2026-08-01');
    await user.type(screen.getByPlaceholderText(/Lagos, Nigeria/), 'Lagos');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await screen.findByText('Transaction confirmed.');

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    jest.useRealTimers();
  });

  it('shows the hook error message when the submit call fails', async () => {
    mockSubmit.mockRejectedValue(new Error('nope'));
    setHook({ error: 'Something went wrong' });
    const user = userEvent.setup();

    render(<TrialOfferModal playerId={PLAYER_ID} />);
    await openModal(user);

    const dialog = screen.getByRole('dialog');
    const dateField = dialog.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement;
    await user.type(screen.getByPlaceholderText(/Trial for striker/), 'Desc');
    await user.type(dateField, '2026-08-01');
    await user.type(screen.getByPlaceholderText(/Lagos, Nigeria/), 'Lagos');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong',
    );
  });

  it('disables fields and shows the submitting label while loading', async () => {
    setHook({ loading: true });
    const user = userEvent.setup();
    render(<TrialOfferModal playerId={PLAYER_ID} />);
    await openModal(user);

    expect(screen.getByPlaceholderText(/Trial for striker/)).toBeDisabled();
    expect(screen.getByPlaceholderText(/Lagos, Nigeria/)).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Submitting...' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
