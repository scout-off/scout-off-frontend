import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import DisputedMilestonesPanel from '@/components/admin/DisputedMilestonesPanel';
import { useWallet } from '@/hooks/useWallet';
import { useDisputeQueue } from '@/hooks/useDisputeQueue';
import { buildRevokeMilestone } from '@/lib/contract';
import type { MilestoneDispute } from '@/types';

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/hooks/useDisputeQueue', () => ({
  useDisputeQueue: jest.fn(),
}));

jest.mock('@/lib/contract', () => ({
  buildRevokeMilestone: jest.fn(),
}));

jest.mock('swr', () => ({
  ...jest.requireActual('swr'),
  mutate: jest.fn(),
}));

const mockUseWallet = useWallet as jest.Mock;
const mockUseDisputeQueue = useDisputeQueue as jest.Mock;
const mockBuildRevokeMilestone = buildRevokeMilestone as jest.Mock;

function makeDispute(overrides: Partial<MilestoneDispute>): MilestoneDispute {
  return {
    id: 1,
    playerId: 'player-1',
    playerWallet: 'GPLAYERWALLET1234567890',
    milestoneId: 'm1',
    milestoneDescription: 'KYC verified',
    reason: 'This was rejected without an explanation.',
    status: 'pending',
    createdAt: 1_700_000_000_000,
    decidedAt: null,
    decidedBy: null,
    resolutionNote: null,
    revokeTxHash: null,
    ...overrides,
  };
}

describe('DisputedMilestonesPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWallet.mockReturnValue({
      publicKey: 'GADMINWALLET1234567890',
      signAndSubmit: jest.fn().mockResolvedValue('tx-hash-123'),
    });
  });

  it('shows the empty state when there are no disputed milestones', () => {
    mockUseDisputeQueue.mockReturnValue({
      disputes: [],
      loading: false,
      error: null,
      decide: jest.fn(),
    });

    render(<DisputedMilestonesPanel />);

    expect(screen.getByText('No disputed milestones')).toBeInTheDocument();
  });

  it('renders a card per pending dispute with the reason and milestone description', () => {
    mockUseDisputeQueue.mockReturnValue({
      disputes: [makeDispute({})],
      loading: false,
      error: null,
      decide: jest.fn(),
    });

    render(<DisputedMilestonesPanel />);

    expect(screen.getByText('KYC verified')).toBeInTheDocument();
    expect(
      screen.getByText('This was rejected without an explanation.'),
    ).toBeInTheDocument();
  });

  it('upholding a dispute calls decide with status "upheld" and no on-chain tx', async () => {
    const decide = jest
      .fn()
      .mockResolvedValue(makeDispute({ status: 'upheld' }));
    mockUseDisputeQueue.mockReturnValue({
      disputes: [makeDispute({ id: 7 })],
      loading: false,
      error: null,
      decide,
    });
    const user = userEvent.setup({ delay: null });

    render(<DisputedMilestonesPanel />);
    await user.click(screen.getByRole('button', { name: 'Uphold decision' }));
    await user.click(screen.getByRole('button', { name: 'Uphold' }));

    expect(decide).toHaveBeenCalledWith(7, {
      status: 'upheld',
      resolutionNote: undefined,
    });
    expect(mockBuildRevokeMilestone).not.toHaveBeenCalled();
  });

  it('reversing a dispute submits the on-chain revoke first, then decides with the tx hash', async () => {
    mockBuildRevokeMilestone.mockResolvedValue('xdr-envelope');
    const decide = jest
      .fn()
      .mockResolvedValue(makeDispute({ status: 'reversed' }));
    mockUseDisputeQueue.mockReturnValue({
      disputes: [
        makeDispute({ id: 9, playerId: 'player-9', milestoneId: 'm9' }),
      ],
      loading: false,
      error: null,
      decide,
    });
    const user = userEvent.setup({ delay: null });

    render(<DisputedMilestonesPanel />);
    await user.click(
      screen.getByRole('button', { name: /Reverse & revoke milestone/i }),
    );
    await user.click(screen.getByRole('button', { name: 'Reverse' }));

    expect(mockBuildRevokeMilestone).toHaveBeenCalledWith(
      'GADMINWALLET1234567890',
      'player-9',
      'm9',
    );
    expect(decide).toHaveBeenCalledWith(9, {
      status: 'reversed',
      resolutionNote: undefined,
      revokeTxHash: 'tx-hash-123',
    });
  });
});
