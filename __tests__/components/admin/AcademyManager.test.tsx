import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AcademyManager from '@/components/admin/AcademyManager';

const mockShow = jest.fn();
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show: mockShow }),
}));

const mockFetchAcademies = jest.fn();
const mockCreateAcademy = jest.fn();
const mockAddAcademyMember = jest.fn();
const mockRemoveAcademyMember = jest.fn();
jest.mock('@/lib/api', () => ({
  fetchAcademies: (...args: unknown[]) => mockFetchAcademies(...args),
  createAcademy: (...args: unknown[]) => mockCreateAcademy(...args),
  addAcademyMember: (...args: unknown[]) => mockAddAcademyMember(...args),
  removeAcademyMember: (...args: unknown[]) => mockRemoveAcademyMember(...args),
}));

const mockCheckIsValidator = jest.fn();
jest.mock('@/lib/contract', () => ({
  checkIsValidator: (...args: unknown[]) => mockCheckIsValidator(...args),
}));

function stellarAddress(prefix: string): string {
  return (prefix + 'A'.repeat(56 - prefix.length)).slice(0, 56);
}

const OWNER = stellarAddress('GOWNER');
const COACH = stellarAddress('GCOACH');

const ACADEMY = {
  id: 'academy-1',
  name: 'FC Sahel',
  ownerWallet: OWNER,
  createdAt: 1_700_000_000,
  members: [
    {
      wallet: OWNER,
      academyId: 'academy-1',
      addedAt: 1_700_000_000,
      addedBy: 'GADMIN',
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckIsValidator.mockResolvedValue(true);
});

describe('AcademyManager', () => {
  it('shows a loading state, then the fetched academies', async () => {
    mockFetchAcademies.mockResolvedValue([ACADEMY]);

    render(<AcademyManager />);

    expect(screen.getByText(/loading academies/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('FC Sahel')).toBeInTheDocument(),
    );
    expect(screen.getByText('1 signer')).toBeInTheDocument();
  });

  it('shows an error state with a working retry', async () => {
    mockFetchAcademies.mockRejectedValueOnce(new Error('boom'));
    mockFetchAcademies.mockResolvedValueOnce([ACADEMY]);

    render(<AcademyManager />);

    await waitFor(() =>
      expect(screen.getByText(/failed to load academies/i)).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText('Retry'));
    await waitFor(() =>
      expect(screen.getByText('FC Sahel')).toBeInTheDocument(),
    );
  });

  it('creates an academy and shows a success toast', async () => {
    mockFetchAcademies.mockResolvedValue([]);
    mockCreateAcademy.mockResolvedValue(ACADEMY);

    render(<AcademyManager />);
    await waitFor(() =>
      expect(screen.getByText(/no academies created/i)).toBeInTheDocument(),
    );

    const createButton = screen.getByRole('button', { name: 'Create' });
    expect(createButton).toBeDisabled();

    await userEvent.type(
      screen.getByPlaceholderText('Academy name'),
      'FC Sahel',
    );
    await userEvent.type(
      screen.getByPlaceholderText(/owner's stellar public key/i),
      OWNER,
    );
    expect(createButton).toBeEnabled();

    await userEvent.click(createButton);

    await waitFor(() =>
      expect(mockCreateAcademy).toHaveBeenCalledWith('FC Sahel', OWNER),
    );
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' }),
    );
    await waitFor(() =>
      expect(screen.getByText('FC Sahel')).toBeInTheDocument(),
    );
  });

  it('adds a signer wallet to an academy after confirming', async () => {
    mockFetchAcademies.mockResolvedValue([ACADEMY]);
    const updated = {
      ...ACADEMY,
      members: [
        ...ACADEMY.members,
        {
          wallet: COACH,
          academyId: 'academy-1',
          addedAt: 1,
          addedBy: 'GADMIN',
        },
      ],
    };
    mockAddAcademyMember.mockResolvedValue(updated);

    render(<AcademyManager />);
    await waitFor(() =>
      expect(screen.getByText('FC Sahel')).toBeInTheDocument(),
    );

    const academyCard = screen
      .getByText('FC Sahel')
      .closest('li') as HTMLElement;
    await userEvent.type(
      within(academyCard).getByPlaceholderText(/add signer wallet/i),
      COACH,
    );
    await userEvent.click(
      within(academyCard).getByRole('button', { name: 'Add' }),
    );

    // Confirm dialog appears; confirm the action.
    const confirmButton = await screen.findByRole('button', {
      name: 'Add Signer',
    });
    await userEvent.click(confirmButton);

    await waitFor(() =>
      expect(mockAddAcademyMember).toHaveBeenCalledWith('academy-1', COACH),
    );
  });

  it('removes a signer wallet from an academy after confirming', async () => {
    const academyWithCoach = {
      ...ACADEMY,
      members: [
        ...ACADEMY.members,
        {
          wallet: COACH,
          academyId: 'academy-1',
          addedAt: 1,
          addedBy: 'GADMIN',
        },
      ],
    };
    mockFetchAcademies.mockResolvedValue([academyWithCoach]);
    mockRemoveAcademyMember.mockResolvedValue(undefined);

    render(<AcademyManager />);
    await waitFor(() =>
      expect(screen.getByText('FC Sahel')).toBeInTheDocument(),
    );

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await userEvent.click(removeButtons[removeButtons.length - 1]);

    const confirmButton = await screen.findByRole('button', {
      name: 'Remove Signer',
    });
    await userEvent.click(confirmButton);

    await waitFor(() =>
      expect(mockRemoveAcademyMember).toHaveBeenCalledWith('academy-1', COACH),
    );
  });

  it('flags a member wallet that is not currently authorized on-chain', async () => {
    mockFetchAcademies.mockResolvedValue([ACADEMY]);
    mockCheckIsValidator.mockResolvedValue(false);

    render(<AcademyManager />);

    await waitFor(() =>
      expect(screen.getByText('not on-chain')).toBeInTheDocument(),
    );
  });
});
