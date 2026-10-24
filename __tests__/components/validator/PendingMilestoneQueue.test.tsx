import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import PendingMilestoneQueue from '@/components/validator/PendingMilestoneQueue';
import { useValidatorPendingQueue } from '@/hooks/useValidatorPendingQueue';
import { useApprovedPlayers } from '@/hooks/useApprovedPlayers';
import { useValidator } from '@/hooks/useValidator';
import { useWallet } from '@/hooks/useWallet';
import useIsPaused from '@/hooks/useIsPaused';
import { decideMilestoneSubmission } from '@/lib/api';
import type { MilestoneSubmission } from '@/types';

jest.mock('@/hooks/useValidatorPendingQueue', () => ({
  useValidatorPendingQueue: jest.fn(),
}));

jest.mock('@/hooks/useApprovedPlayers', () => ({
  useApprovedPlayers: jest.fn(),
}));

jest.mock('@/hooks/useValidator', () => ({
  useValidator: jest.fn(),
}));

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/hooks/useIsPaused', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  decideMilestoneSubmission: jest.fn(),
}));

jest.mock('@/lib/confirmApprovalSubmission', () => ({
  submitAndConfirmApproval: jest.fn(),
  isOnChainApproved: (phase: string) =>
    phase === 'success' || phase === 'event_lag',
  CONFIRM_MAX_ATTEMPTS: 20,
  CONFIRM_POLL_INTERVAL_MS: 2000,
}));

import { submitAndConfirmApproval } from '@/lib/confirmApprovalSubmission';

const mockedUseValidatorPendingQueue =
  useValidatorPendingQueue as jest.MockedFunction<
    typeof useValidatorPendingQueue
  >;
const mockedUseApprovedPlayers = useApprovedPlayers as jest.MockedFunction<
  typeof useApprovedPlayers
>;
const mockedUseValidator = useValidator as jest.MockedFunction<
  typeof useValidator
>;
const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedUseIsPaused = useIsPaused as jest.MockedFunction<
  typeof useIsPaused
>;
const mockedDecideMilestoneSubmission =
  decideMilestoneSubmission as jest.MockedFunction<
    typeof decideMilestoneSubmission
  >;
const mockedSubmitAndConfirm = submitAndConfirmApproval as jest.MockedFunction<
  typeof submitAndConfirmApproval
>;

const VALIDATOR_ADDRESS = 'GVALIDATORPUBLICKEY';

const submissions: MilestoneSubmission[] = [
  {
    id: 'sub-1',
    playerId: 'player-1',
    playerName: 'Alex Okafor',
    description: 'Scored a hat-trick',
    evidenceUrl: 'https://example.com/evidence-1',
    validatorWallet: VALIDATOR_ADDRESS,
    submittedBy: 'player-1',
    status: 'pending',
    createdAt: 1_700_000_000_000,
    decidedAt: null,
    txHash: null,
  },
  {
    id: 'sub-2',
    playerId: 'player-2',
    playerName: null,
    description: 'Completed 10 assists',
    evidenceUrl: null,
    validatorWallet: VALIDATOR_ADDRESS,
    submittedBy: 'player-2',
    status: 'pending',
    createdAt: 1_700_100_000_000,
    decidedAt: null,
    txHash: null,
  },
  {
    id: 'sub-3',
    playerId: 'player-3',
    playerName: 'Maria Santos',
    description: 'Clean sheet streak',
    evidenceUrl: null,
    validatorWallet: VALIDATOR_ADDRESS,
    submittedBy: 'player-3',
    status: 'pending',
    createdAt: 1_700_200_000_000,
    decidedAt: null,
    txHash: null,
  },
];

function setup({
  submissionsOverride = submissions,
  loading = false,
  error = null as string | null,
  refetch = jest.fn(),
  approvedPlayers = [] as { id: string }[],
  approveMilestone = jest.fn(),
  signAndSubmit = jest.fn(),
  isPaused = false,
} = {}) {
  mockedUseValidatorPendingQueue.mockReturnValue({
    submissions: submissionsOverride,
    loading,
    error,
    refetch,
  });
  mockedUseApprovedPlayers.mockReturnValue({
    players: approvedPlayers as any,
    loading: false,
    error: null,
    refetch: jest.fn(),
  });
  mockedUseValidator.mockReturnValue({
    isValidator: true,
    checking: false,
    approveMilestone,
    revokeMilestone: jest.fn(),
    loading: false,
    error: null,
  });
  mockedUseWallet.mockReturnValue({
    publicKey: VALIDATOR_ADDRESS,
    isAuthenticated: true,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSubmit,
  } as any);
  mockedUseIsPaused.mockReturnValue(isPaused);

  return render(<PendingMilestoneQueue validatorAddress={VALIDATOR_ADDRESS} />);
}

describe('PendingMilestoneQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows skeleton placeholders and no pending count while loading', () => {
      const { container } = setup({ loading: true, submissionsOverride: [] });

      expect(screen.queryByText(/pending$/)).not.toBeInTheDocument();
      expect(
        container.querySelectorAll('.animate-pulse').length,
      ).toBeGreaterThan(0);
    });
  });

  describe('error state', () => {
    it('shows an error message and retries on button click', () => {
      const refetch = jest.fn();
      setup({ error: 'Network error', submissionsOverride: [], refetch });

      expect(
        screen.getByText('Could not load pending milestones.'),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('empty state', () => {
    it('shows the default empty message when filter is "all"', () => {
      setup({ submissionsOverride: [] });

      expect(screen.getByText('No pending milestones')).toBeInTheDocument();
      expect(
        screen.getByText(
          'New submissions from players will appear here for review.',
        ),
      ).toBeInTheDocument();
    });

    it('shows the previously-approved empty message when that filter is active and no matches exist', () => {
      setup({ submissionsOverride: submissions, approvedPlayers: [] });

      fireEvent.change(screen.getByLabelText('Filter'), {
        target: { value: 'previously-approved' },
      });

      expect(
        screen.getByText(
          "No pending submissions from players you've previously approved.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe('populated list', () => {
    it('renders the pending count and each submission', () => {
      setup();

      expect(screen.getByText('3 pending')).toBeInTheDocument();
      expect(screen.getByText('Alex Okafor')).toBeInTheDocument();
      // playerName is null for sub-2 → falls back to playerId
      expect(screen.getByText('player-2')).toBeInTheDocument();
      expect(screen.getByText('Maria Santos')).toBeInTheDocument();
      expect(screen.getByText('Scored a hat-trick')).toBeInTheDocument();
    });

    it('renders an evidence link only when evidenceUrl is present', () => {
      setup();

      const links = screen.getAllByRole('link', { name: 'View evidence' });
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute(
        'href',
        'https://example.com/evidence-1',
      );
    });

    it('sorts oldest first by default and re-sorts to newest first', () => {
      setup();

      let items = screen.getAllByRole('listitem');
      expect(within(items[0]).getByText('Alex Okafor')).toBeInTheDocument();
      expect(within(items[2]).getByText('Maria Santos')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Sort'), {
        target: { value: 'newest' },
      });

      items = screen.getAllByRole('listitem');
      expect(within(items[0]).getByText('Maria Santos')).toBeInTheDocument();
      expect(within(items[2]).getByText('Alex Okafor')).toBeInTheDocument();
    });

    it('filters to only previously-approved players', () => {
      setup({ approvedPlayers: [{ id: 'player-2' }] });

      fireEvent.change(screen.getByLabelText('Filter'), {
        target: { value: 'previously-approved' },
      });

      expect(screen.getByText('1 pending')).toBeInTheDocument();
      expect(screen.getByText('player-2')).toBeInTheDocument();
      expect(screen.queryByText('Alex Okafor')).not.toBeInTheDocument();
    });

    it('toggles selection of an individual submission', () => {
      setup();

      const checkbox = screen.getByLabelText(
        'Select milestone for Alex Okafor',
      );
      expect(checkbox).not.toBeChecked();
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
      fireEvent.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });

    it('selects and deselects all visible submissions via the header checkbox', () => {
      setup();

      const selectAll = screen.getByLabelText(
        'Select all visible pending milestones',
      );
      fireEvent.click(selectAll);

      expect(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      ).toBeChecked();
      expect(
        screen.getByLabelText('Select milestone for player-2'),
      ).toBeChecked();
      expect(selectAll).toBeChecked();

      fireEvent.click(selectAll);
      expect(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      ).not.toBeChecked();
    });

    it('disables Bulk Approve when nothing is selected and enables it once items are selected', () => {
      setup();

      const bulkButton = screen.getByRole('button', { name: /Bulk Approve/ });
      expect(bulkButton).toBeDisabled();

      fireEvent.click(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      );
      expect(bulkButton).not.toBeDisabled();
      expect(bulkButton).toHaveTextContent('Bulk Approve (1)');
    });

    it('disables Bulk Approve and shows a title when the contract is paused', () => {
      setup({ isPaused: true });

      fireEvent.click(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      );
      const bulkButton = screen.getByRole('button', { name: /Bulk Approve/ });
      expect(bulkButton).toHaveAttribute('aria-disabled', 'true');
      // contract_status resolves to the English copy in the global mock.
      expect(bulkButton).toHaveAccessibleDescription(
        'Temporarily unavailable — the platform is paused for maintenance',
      );
    });
  });

  describe('bulk approve flow', () => {
    it('approves selected items only after confirmation, shows success summary, and refetches', async () => {
      const refetch = jest.fn();
      const approveMilestone = jest.fn().mockResolvedValue('xdr-payload');
      const signAndSubmit = jest.fn();
      mockedDecideMilestoneSubmission.mockResolvedValue({} as any);
      mockedSubmitAndConfirm.mockResolvedValue({
        phase: 'success',
        hash: 'tx-hash-1',
        message: 'Transaction confirmed on-chain.',
      });

      setup({ refetch, approveMilestone, signAndSubmit });

      fireEvent.click(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      );
      fireEvent.click(screen.getByLabelText('Select milestone for player-2'));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Bulk Approve/ }));
      });

      expect(
        screen.getByText('All 2 selected milestones were confirmed on-chain.'),
      ).toBeInTheDocument();
      expect(mockedSubmitAndConfirm).toHaveBeenCalledTimes(2);
      expect(mockedDecideMilestoneSubmission).toHaveBeenCalledTimes(2);
      expect(mockedDecideMilestoneSubmission).toHaveBeenCalledWith(
        'sub-1',
        'approved',
        'tx-hash-1',
      );
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(
        screen.getByLabelText('Select all visible pending milestones'),
      ).not.toBeChecked();
    });

    it('does not call decideMilestoneSubmission when confirmation times out', async () => {
      mockedSubmitAndConfirm.mockResolvedValue({
        phase: 'timeout',
        hash: 'tx-hash-timeout',
        message:
          'Transaction was submitted but not confirmed on-chain in time.',
      });

      setup({
        approveMilestone: jest.fn().mockResolvedValue('xdr'),
        signAndSubmit: jest.fn(),
      });

      fireEvent.click(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Bulk Approve/ }));
      });

      expect(mockedDecideMilestoneSubmission).not.toHaveBeenCalled();
      expect(screen.getByText(/Not confirmed in time/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          '0 of 1 approvals confirmed on-chain — 1 failed and remain pending for retry.',
        ),
      ).toBeInTheDocument();
    });

    it('one item timing out does not block or fail sibling items; summary counts confirmed only', async () => {
      // First selected item times out; second succeeds.
      let call = 0;
      mockedSubmitAndConfirm.mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return {
            phase: 'timeout',
            hash: 'timeout-hash',
            message: 'not confirmed in time',
          };
        }
        return {
          phase: 'success',
          hash: 'ok-hash',
          message: 'confirmed',
        };
      });
      mockedDecideMilestoneSubmission.mockResolvedValue({} as any);

      setup({
        approveMilestone: jest.fn().mockResolvedValue('xdr-payload'),
        signAndSubmit: jest.fn(),
      });

      fireEvent.click(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      );
      fireEvent.click(screen.getByLabelText('Select milestone for player-2'));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Bulk Approve/ }));
      });

      expect(mockedSubmitAndConfirm).toHaveBeenCalledTimes(2);
      expect(mockedDecideMilestoneSubmission).toHaveBeenCalledTimes(1);
      expect(mockedDecideMilestoneSubmission).toHaveBeenCalledWith(
        'sub-2',
        'approved',
        'ok-hash',
      );
      expect(
        screen.getByText(
          '1 of 2 approvals confirmed on-chain — 1 failed and remain pending for retry.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(/Not confirmed in time/i)).toBeInTheDocument();
      expect(screen.getByText('✓ Confirmed on-chain')).toBeInTheDocument();
    });

    it('shows per-item failure state and a mixed-result summary when some approvals fail on ledger', async () => {
      let call = 0;
      mockedSubmitAndConfirm.mockImplementation(async () => {
        call += 1;
        if (call === 2) {
          return {
            phase: 'failed',
            hash: 'fail-hash',
            message: 'Transaction failed on the ledger.',
          };
        }
        return {
          phase: 'success',
          hash: 'tx-hash-1',
          message: 'confirmed',
        };
      });
      mockedDecideMilestoneSubmission.mockResolvedValue({} as any);

      setup({
        approveMilestone: jest.fn().mockResolvedValue('xdr-payload'),
        signAndSubmit: jest.fn(),
      });

      fireEvent.click(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      );
      fireEvent.click(screen.getByLabelText('Select milestone for player-2'));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Bulk Approve/ }));
      });

      expect(
        screen.getByText(
          '1 of 2 approvals confirmed on-chain — 1 failed and remain pending for retry.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(/Failed on ledger/i)).toBeInTheDocument();
      expect(screen.getByText('✓ Confirmed on-chain')).toBeInTheDocument();
      expect(mockedDecideMilestoneSubmission).toHaveBeenCalledTimes(1);
    });

    it('does nothing when Bulk Approve is triggered with no selection', () => {
      const approveMilestone = jest.fn();
      setup({ approveMilestone });
      expect(approveMilestone).not.toHaveBeenCalled();
    });

    it('does not show a Stop control before a batch has started', () => {
      setup();
      expect(
        screen.queryByRole('button', { name: /Stop/ }),
      ).not.toBeInTheDocument();
    });

    it('stops the batch after the in-flight item completes, leaving the rest unattempted and still selected', async () => {
      const refetch = jest.fn();
      const approveMilestone = jest.fn().mockResolvedValue('xdr-payload');
      const signAndSubmit = jest.fn();
      mockedDecideMilestoneSubmission.mockResolvedValue({} as any);

      let resolveFirst!: (value: {
        phase: string;
        hash: string;
        message: string;
      }) => void;
      const firstResult = new Promise<{
        phase: string;
        hash: string;
        message: string;
      }>((resolve) => {
        resolveFirst = resolve;
      });
      mockedSubmitAndConfirm.mockImplementationOnce(() => firstResult as any);

      setup({ refetch, approveMilestone, signAndSubmit });

      fireEvent.click(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      );
      fireEvent.click(screen.getByLabelText('Select milestone for player-2'));
      fireEvent.click(
        screen.getByLabelText('Select milestone for Maria Santos'),
      );

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /Bulk Approve/ }));
      });

      // First item is in flight — the Stop control is now available.
      const stopButton = await screen.findByRole('button', { name: 'Stop' });

      act(() => {
        fireEvent.click(stopButton);
      });
      expect(screen.getByRole('button', { name: 'Stopping…' })).toBeDisabled();

      await act(async () => {
        resolveFirst({
          phase: 'success',
          hash: 'tx-hash-1',
          message: 'confirmed',
        });
      });

      // Batch actually stops once the in-flight item resolves.
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /Stop/ }),
        ).not.toBeInTheDocument();
      });

      // Exactly one item was attempted.
      expect(mockedSubmitAndConfirm).toHaveBeenCalledTimes(1);
      expect(mockedDecideMilestoneSubmission).toHaveBeenCalledTimes(1);
      expect(mockedDecideMilestoneSubmission).toHaveBeenCalledWith(
        'sub-1',
        'approved',
        'tx-hash-1',
      );

      // The attempted item succeeded and is no longer selected.
      expect(screen.getByText('✓ Confirmed on-chain')).toBeInTheDocument();
      expect(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      ).not.toBeChecked();

      // The remaining items were never attempted — not failed, not selected away.
      expect(
        screen.getAllByText('Not attempted — batch was stopped'),
      ).toHaveLength(2);
      expect(screen.queryByText(/✕/)).not.toBeInTheDocument();
      expect(
        screen.getByLabelText('Select milestone for player-2'),
      ).toBeChecked();
      expect(
        screen.getByLabelText('Select milestone for Maria Santos'),
      ).toBeChecked();

      // refetch still runs so the completed approval is reflected.
      expect(refetch).toHaveBeenCalledTimes(1);

      expect(
        screen.getByText(
          '1 of 3 selected approvals completed before the batch was stopped — 1 confirmed on-chain, and 2 not attempted.',
        ),
      ).toBeInTheDocument();
    });
  });
});
