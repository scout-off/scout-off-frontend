import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AcademyQuorumBadge from '@/components/player/AcademyQuorumBadge';
import { ToastProvider } from '@/components/ui/Toast';
import { useWallet } from '@/hooks/useWallet';
import { useValidator } from '@/hooks/useValidator';
import {
  fetchAcademyForWallet,
  fetchMilestoneEndorsements,
  endorseMilestone,
} from '@/lib/api';
import type { Academy, Milestone } from '@/types';

jest.mock('@/hooks/useWallet', () => ({ useWallet: jest.fn() }));
jest.mock('@/hooks/useValidator', () => ({ useValidator: jest.fn() }));
jest.mock('@/lib/api', () => ({
  fetchAcademyForWallet: jest.fn(),
  fetchMilestoneEndorsements: jest.fn(),
  endorseMilestone: jest.fn(),
}));

const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedUseValidator = useValidator as jest.Mock;
const mockedFetchAcademyForWallet = fetchAcademyForWallet as jest.Mock;
const mockedFetchMilestoneEndorsements = fetchMilestoneEndorsements as jest.Mock;
const mockedEndorseMilestone = endorseMilestone as jest.Mock;

const APPROVER = 'GAPPROVER000000000000000000000000000000000000000000000';
const MEMBER_A = 'GMEMBER_A00000000000000000000000000000000000000000000';
const MEMBER_B = 'GMEMBER_B00000000000000000000000000000000000000000000';

const milestone: Milestone = {
  id: 'milestone-1',
  description: 'Signed pro contract',
  evidenceHash: 'Qm123',
  validator: APPROVER,
  timestamp: 1_700_000_000,
};

function makeAcademy(overrides: Partial<Academy> = {}): Academy {
  return {
    id: 'academy-1',
    name: 'FC Sahel',
    ownerWallet: APPROVER,
    createdAt: 1,
    members: [
      { wallet: APPROVER, academyId: 'academy-1', addedAt: 1, addedBy: 'GADMIN' },
      { wallet: MEMBER_A, academyId: 'academy-1', addedAt: 1, addedBy: 'GADMIN' },
      { wallet: MEMBER_B, academyId: 'academy-1', addedAt: 1, addedBy: 'GADMIN' },
    ],
    quorum: 2,
    ...overrides,
  };
}

function setWallet(publicKey: string | null) {
  mockedUseWallet.mockReturnValue({
    publicKey,
    isAuthenticated: Boolean(publicKey),
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSubmit: jest.fn(),
  } as any);
}

beforeEach(() => {
  jest.clearAllMocks();
  setWallet(null);
  mockedUseValidator.mockReturnValue({ isValidator: false, checking: false });
});

describe('AcademyQuorumBadge', () => {
  it('renders nothing when the approving validator has no academy', async () => {
    mockedFetchAcademyForWallet.mockResolvedValue(null);
    mockedFetchMilestoneEndorsements.mockResolvedValue([]);

    render(
      <ToastProvider>
        <AcademyQuorumBadge playerId="player-1" milestone={milestone} />
      </ToastProvider>,
    );
    await waitFor(() => expect(mockedFetchAcademyForWallet).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders nothing when the academy has no quorum configured (default, no regression)', async () => {
    mockedFetchAcademyForWallet.mockResolvedValue(makeAcademy({ quorum: null }));
    mockedFetchMilestoneEndorsements.mockResolvedValue([]);

    render(
      <ToastProvider>
        <AcademyQuorumBadge playerId="player-1" milestone={milestone} />
      </ToastProvider>,
    );
    await waitFor(() => expect(mockedFetchAcademyForWallet).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows "Academy pending" when fewer signers than the quorum have endorsed', async () => {
    mockedFetchAcademyForWallet.mockResolvedValue(makeAcademy({ quorum: 2 }));
    mockedFetchMilestoneEndorsements.mockResolvedValue([
      { playerId: 'player-1', milestoneId: 'milestone-1', wallet: APPROVER, createdAt: 1 },
    ]);

    render(
      <ToastProvider>
        <AcademyQuorumBadge playerId="player-1" milestone={milestone} />
      </ToastProvider>,
    );

    expect(await screen.findByText(/academy pending/i)).toBeInTheDocument();
    expect(screen.getByText(/\(1\/2\)/)).toBeInTheDocument();
  });

  it('shows "Academy-verified" once the configured quorum of distinct academy signers is met', async () => {
    mockedFetchAcademyForWallet.mockResolvedValue(makeAcademy({ quorum: 2 }));
    mockedFetchMilestoneEndorsements.mockResolvedValue([
      { playerId: 'player-1', milestoneId: 'milestone-1', wallet: APPROVER, createdAt: 1 },
      { playerId: 'player-1', milestoneId: 'milestone-1', wallet: MEMBER_A, createdAt: 2 },
    ]);

    render(
      <ToastProvider>
        <AcademyQuorumBadge playerId="player-1" milestone={milestone} />
      </ToastProvider>,
    );

    expect(await screen.findByText(/academy-verified/i)).toBeInTheDocument();
    expect(screen.getByText(/\(2\/2\)/)).toBeInTheDocument();
  });

  it('does not count an endorsement from a wallet no longer on the academy roster', async () => {
    mockedFetchAcademyForWallet.mockResolvedValue(
      makeAcademy({
        quorum: 2,
        members: [
          { wallet: APPROVER, academyId: 'academy-1', addedAt: 1, addedBy: 'GADMIN' },
        ],
      }),
    );
    mockedFetchMilestoneEndorsements.mockResolvedValue([
      { playerId: 'player-1', milestoneId: 'milestone-1', wallet: APPROVER, createdAt: 1 },
      { playerId: 'player-1', milestoneId: 'milestone-1', wallet: MEMBER_A, createdAt: 2 }, // no longer a member
    ]);

    render(
      <ToastProvider>
        <AcademyQuorumBadge playerId="player-1" milestone={milestone} />
      </ToastProvider>,
    );

    expect(await screen.findByText(/academy pending/i)).toBeInTheDocument();
    expect(screen.getByText(/\(1\/2\)/)).toBeInTheDocument();
  });

  it('shows an Endorse button for a connected validator who is an academy member and has not yet endorsed', async () => {
    setWallet(MEMBER_B);
    mockedUseValidator.mockReturnValue({ isValidator: true, checking: false });
    mockedFetchAcademyForWallet.mockResolvedValue(makeAcademy({ quorum: 3 }));
    mockedFetchMilestoneEndorsements.mockResolvedValue([
      { playerId: 'player-1', milestoneId: 'milestone-1', wallet: APPROVER, createdAt: 1 },
    ]);

    render(
      <ToastProvider>
        <AcademyQuorumBadge playerId="player-1" milestone={milestone} />
      </ToastProvider>,
    );

    expect(await screen.findByRole('button', { name: /endorse/i })).toBeInTheDocument();
  });

  it('hides the Endorse button once the connected wallet has already endorsed', async () => {
    setWallet(MEMBER_A);
    mockedUseValidator.mockReturnValue({ isValidator: true, checking: false });
    mockedFetchAcademyForWallet.mockResolvedValue(makeAcademy({ quorum: 3 }));
    mockedFetchMilestoneEndorsements.mockResolvedValue([
      { playerId: 'player-1', milestoneId: 'milestone-1', wallet: APPROVER, createdAt: 1 },
      { playerId: 'player-1', milestoneId: 'milestone-1', wallet: MEMBER_A, createdAt: 2 },
    ]);

    render(
      <ToastProvider>
        <AcademyQuorumBadge playerId="player-1" milestone={milestone} />
      </ToastProvider>,
    );
    await screen.findByText(/academy pending/i);

    expect(screen.queryByRole('button', { name: /endorse/i })).not.toBeInTheDocument();
  });

  it('calls endorseMilestone and refreshes the count when Endorse is clicked', async () => {
    setWallet(MEMBER_B);
    mockedUseValidator.mockReturnValue({ isValidator: true, checking: false });
    mockedFetchAcademyForWallet.mockResolvedValue(makeAcademy({ quorum: 3 }));
    mockedFetchMilestoneEndorsements
      .mockResolvedValueOnce([
        { playerId: 'player-1', milestoneId: 'milestone-1', wallet: APPROVER, createdAt: 1 },
      ])
      .mockResolvedValueOnce([
        { playerId: 'player-1', milestoneId: 'milestone-1', wallet: APPROVER, createdAt: 1 },
        { playerId: 'player-1', milestoneId: 'milestone-1', wallet: MEMBER_B, createdAt: 2 },
      ]);
    mockedEndorseMilestone.mockResolvedValue(undefined);

    render(
      <ToastProvider>
        <AcademyQuorumBadge playerId="player-1" milestone={milestone} />
      </ToastProvider>,
    );
    const btn = await screen.findByRole('button', { name: /endorse/i });

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(mockedEndorseMilestone).toHaveBeenCalledWith('player-1', 'milestone-1');
    expect(await screen.findByText(/\(2\/3\)/)).toBeInTheDocument();
  });
});
