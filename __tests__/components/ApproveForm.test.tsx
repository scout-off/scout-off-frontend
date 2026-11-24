import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ApproveForm from '@/components/validator/ApproveForm';
import { useWallet } from '@/hooks/useWallet';
import { useValidator } from '@/hooks/useValidator';
import { getPlayer } from '@/lib/contract';
import { submitAndConfirmApproval } from '@/lib/confirmApprovalSubmission';
import type { Player } from '@/types';

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/hooks/useValidator', () => ({
  useValidator: jest.fn(),
}));

jest.mock('@/lib/contract', () => ({
  getPlayer: jest.fn(),
}));

jest.mock('@/lib/confirmApprovalSubmission', () => ({
  submitAndConfirmApproval: jest.fn(),
  isOnChainApproved: (phase: string) =>
    phase === 'success' || phase === 'event_lag',
}));

const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedUseValidator = useValidator as jest.MockedFunction<
  typeof useValidator
>;
const mockedGetPlayer = getPlayer as jest.MockedFunction<typeof getPlayer>;
const mockedSubmitAndConfirm = submitAndConfirmApproval as jest.MockedFunction<
  typeof submitAndConfirmApproval
>;

const player: Player = {
  id: 'player-1',
  wallet: 'GABC123PUBLICKEY',
  vitals: {
    name: 'Test Player',
    age: 20,
    position: 'Forward',
    region: 'West Africa',
    nationality: 'Nigerian',
  },
  ipfsHash: 'Qmabcdef1234567890abcdef1234567890abcdef12',
  progressLevel: 0,
  milestones: [],
  createdAt: 1234567890,
};

const HASH = 'real-ledger-tx-hash-001';

function fillForm() {
  fireEvent.change(screen.getByPlaceholderText('Enter player ID'), {
    target: { value: 'player-1' },
  });
  fireEvent.change(
    screen.getByPlaceholderText(/Describe the player's achievement/i),
    { target: { value: 'Test milestone' } },
  );
  fireEvent.change(
    screen.getByPlaceholderText('https://example.com/evidence'),
    { target: { value: 'https://example.com/evidence' } },
  );
}

function renderComponent(
  isValidator: boolean = true,
  onSuccess: () => void = jest.fn(),
) {
  mockedUseWallet.mockReturnValue({
    publicKey: 'GVALIDATORPUBLICKEY',
    isAuthenticated: true,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSubmit: jest.fn(),
  } as any);

  mockedUseValidator.mockReturnValue({
    isValidator,
    checking: false,
    approveMilestone: jest.fn().mockResolvedValue('mock-xdr'),
    revokeMilestone: jest.fn(),
    loading: false,
    error: null,
  });

  return render(<ApproveForm onSuccess={onSuccess} />);
}

describe('ApproveForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSubmitAndConfirm.mockResolvedValue({
      phase: 'success',
      hash: HASH,
      message: 'Transaction confirmed on-chain.',
    });
  });

  it('shows not a validator message when isValidator=false', () => {
    renderComponent(false);
    expect(screen.getByText('Not a validator')).toBeInTheDocument();
  });

  it('displays the form when isValidator=true', () => {
    renderComponent(true);
    expect(
      screen.getByRole('heading', { name: 'Approve Milestone' }),
    ).toBeInTheDocument();
  });

  it('shows validation error for invalid evidence URL', async () => {
    renderComponent(true);
    fireEvent.change(
      screen.getByPlaceholderText('https://example.com/evidence'),
      { target: { value: 'invalid-url' } },
    );
    expect(
      await screen.findByText('Evidence URL must be a valid http/https URL'),
    ).toBeInTheDocument();
  });

  it('calls submitAndConfirmApproval and onSuccess only after confirmation', async () => {
    const onSuccess = jest.fn();
    const approveMilestone = jest.fn().mockResolvedValue('mock-xdr');
    const signAndSubmit = jest.fn();

    mockedUseValidator.mockReturnValue({
      isValidator: true,
      checking: false,
      approveMilestone,
      revokeMilestone: jest.fn(),
      loading: false,
      error: null,
    });
    mockedUseWallet.mockReturnValue({
      publicKey: 'GVALIDATORPUBLICKEY',
      isAuthenticated: true,
      isConnecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signAndSubmit,
    } as any);

    mockedSubmitAndConfirm.mockImplementation(async (params) => {
      params.onPhase?.('confirming', { hash: HASH });
      params.onPhase?.('success', { hash: HASH });
      return {
        phase: 'success',
        hash: HASH,
        message: 'Transaction confirmed on-chain.',
      };
    });

    render(<ApproveForm onSuccess={onSuccess} />);
    fillForm();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Approve Milestone/i }),
      );
    });

    expect(mockedSubmitAndConfirm).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    // Hash extraction bug fix: real hash is linked in the success UI
    const link = screen.getByRole('link', {
      name: /View transaction on Stellar Expert/i,
    });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining(`/tx/${HASH}`),
    );
  });

  it('does not call onSuccess when ledger confirmation fails', async () => {
    const onSuccess = jest.fn();
    mockedSubmitAndConfirm.mockResolvedValue({
      phase: 'failed',
      hash: HASH,
      message:
        'Transaction failed on the ledger. The milestone was not approved — you can try again.',
    });

    renderComponent(true, onSuccess);
    fillForm();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Approve Milestone/i }),
      );
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByText(/failed on the ledger/i)).toBeInTheDocument();
  });

  it('shows a distinct timeout message and keeps the form retryable', async () => {
    const onSuccess = jest.fn();
    mockedSubmitAndConfirm.mockResolvedValue({
      phase: 'timeout',
      hash: HASH,
      message:
        'Transaction was submitted but not confirmed on-chain in time. Check the explorer link; if it never confirms, you can retry.',
    });

    renderComponent(true, onSuccess);
    fillForm();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Approve Milestone/i }),
      );
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(
      screen.getByText(/not confirmed on-chain in time/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Approve Milestone/i }),
    ).not.toBeDisabled();
  });

  it('shows event_lag distinctly and still calls onSuccess (on-chain OK)', async () => {
    const onSuccess = jest.fn();
    mockedSubmitAndConfirm.mockImplementation(async (params) => {
      params.onPhase?.('event_lag', {
        hash: HASH,
        message:
          'Approved on-chain, but the activity feed has not caught up yet.',
      });
      return {
        phase: 'event_lag',
        hash: HASH,
        message:
          'Approved on-chain, but the activity feed has not caught up yet.',
      };
    });

    renderComponent(true, onSuccess);
    fillForm();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Approve Milestone/i }),
      );
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/activity feed has not caught up/i),
    ).toBeInTheDocument();
  });

  // silence unused import warning for getPlayer mock usage in other tests
  void mockedGetPlayer;
  void player;
});
