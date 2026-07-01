import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerOnboardingWizard from '@/components/player/PlayerOnboardingWizard';
import { useWallet } from '@/hooks/useWallet';
import { buildRegisterPlayer } from '@/lib/contract';
import type { Player } from '@/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/stellar', () => ({
  rpc: {
    getAccount: jest.fn(),
    prepareTransaction: jest.fn(),
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
  },
  NETWORK: 'TESTNET',
  BASE_FEE: '100',
}));

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/hooks/useIsPaused', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue(false),
}));

jest.mock('@/lib/contract', () => ({
  buildRegisterPlayer: jest.fn(),
}));

jest.mock('@/components/ui/VideoUpload', () => ({
  __esModule: true,
  default: ({
    onUpload,
    error,
  }: {
    onUpload: (cid: string) => void;
    error?: string;
  }) => (
    <div>
      <button type="button" onClick={() => onUpload('QmTestCID1234567890')}>
        Upload video
      </button>
      {error && <p>{error}</p>}
    </div>
  ),
}));

const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedBuildRegisterPlayer = buildRegisterPlayer as jest.MockedFunction<
  typeof buildRegisterPlayer
>;

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_PUBLIC_KEY = 'GABC123PUBLICKEY';

function setupWallet(overrides: Partial<ReturnType<typeof useWallet>> = {}) {
  mockedUseWallet.mockReturnValue({
    publicKey: MOCK_PUBLIC_KEY,
    isAuthenticated: true,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSubmit: jest.fn().mockResolvedValue({ hash: 'tx-hash-123' }),
    ...overrides,
  } as any);
}

function renderWizard(onSuccess = jest.fn()) {
  setupWallet();
  return render(<PlayerOnboardingWizard onSuccess={onSuccess} />);
}

async function fillStep1AndAdvance() {
  fireEvent.change(screen.getByLabelText(/name \*/i), {
    target: { name: 'name', value: 'John Doe' },
  });
  fireEvent.change(screen.getByLabelText(/age \*/i), {
    target: { name: 'age', value: '22' },
  });
  fireEvent.change(screen.getByLabelText(/nationality \*/i), {
    target: { name: 'nationality', value: 'Nigerian' },
  });
  // Select component doesn't wire htmlFor/id — target by name attribute
  const [regionSelect, positionSelect] = screen.getAllByRole('combobox');
  fireEvent.change(regionSelect, {
    target: { name: 'region', value: 'nigeria' },
  });
  fireEvent.change(positionSelect, {
    target: { name: 'position', value: 'ST' },
  });
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PlayerOnboardingWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Initial render ────────────────────────────────────────────────────────

  it('renders step 1 (Personal Information) by default', () => {
    renderWizard();
    expect(
      screen.getByRole('heading', { name: /personal information/i }),
    ).toBeInTheDocument();
  });

  it('shows all three steps in the progress stepper', () => {
    renderWizard();
    expect(screen.getByText('Personal Info')).toBeInTheDocument();
    expect(screen.getByText('Highlight Reel')).toBeInTheDocument();
    expect(screen.getByText('Review & Confirm')).toBeInTheDocument();
  });

  it('marks step 1 as the current step via aria-current', () => {
    renderWizard();
    const stepCircles = screen
      .getAllByRole('generic')
      .filter((el) => el.getAttribute('aria-current') === 'step');
    expect(stepCircles).toHaveLength(1);
    expect(stepCircles[0]).toHaveTextContent('1');
  });

  it('renders all required step 1 fields', () => {
    renderWizard();
    expect(screen.getByLabelText(/name \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/age \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nationality \*/i)).toBeInTheDocument();
    const combos = screen.getAllByRole('combobox');
    expect(combos).toHaveLength(2);
    expect(screen.getByText('Region *')).toBeInTheDocument();
    expect(screen.getByText('Position *')).toBeInTheDocument();
  });

  // ── Step 1 validation ─────────────────────────────────────────────────────

  it('prevents advancing from step 1 when all fields are empty', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(
      screen.getByRole('heading', { name: /personal information/i }),
    ).toBeInTheDocument();
  });

  it('shows required field errors when continuing with empty step 1', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Age is required')).toBeInTheDocument();
    expect(screen.getByText('Nationality is required')).toBeInTheDocument();
    expect(screen.getByText('Region is required')).toBeInTheDocument();
    expect(screen.getByText('Position is required')).toBeInTheDocument();
  });

  it('shows a name-too-short error for a single-character name', () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/name \*/i), {
      target: { name: 'name', value: 'A' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(
      screen.getByText('Name must be at least 2 characters'),
    ).toBeInTheDocument();
  });

  it('shows a name-too-long error when name exceeds 50 characters', () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/name \*/i), {
      target: { name: 'name', value: 'A'.repeat(51) },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(
      screen.getByText('Name must be 50 characters or fewer'),
    ).toBeInTheDocument();
  });

  it('shows an age range error for age below 14', () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/age \*/i), {
      target: { name: 'age', value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(
      screen.getByText('Age must be between 14 and 45'),
    ).toBeInTheDocument();
  });

  it('shows an age range error for age above 45', () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/age \*/i), {
      target: { name: 'age', value: '50' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(
      screen.getByText('Age must be between 14 and 45'),
    ).toBeInTheDocument();
  });

  it('shows a name error on blur when field is left empty', () => {
    renderWizard();
    const nameInput = screen.getByLabelText(/name \*/i);
    fireEvent.focus(nameInput);
    fireEvent.blur(nameInput, { target: { name: 'name', value: '' } });
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('shows an age error on blur when age is out of range', () => {
    renderWizard();
    const ageInput = screen.getByLabelText(/age \*/i);
    fireEvent.focus(ageInput);
    fireEvent.blur(ageInput, { target: { name: 'age', value: '5' } });
    expect(
      screen.getByText('Age must be between 14 and 45'),
    ).toBeInTheDocument();
  });

  it('shows a nationality error on blur when field is empty', () => {
    renderWizard();
    const nationalityInput = screen.getByLabelText(/nationality \*/i);
    fireEvent.focus(nationalityInput);
    fireEvent.blur(nationalityInput, {
      target: { name: 'nationality', value: '' },
    });
    expect(screen.getByText('Nationality is required')).toBeInTheDocument();
  });

  it('clears a field error as soon as the user corrects the input', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText('Name is required')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/name \*/i), {
      target: { name: 'name', value: 'Jo' },
    });
    expect(screen.queryByText('Name is required')).toBeNull();
  });

  it('disables Continue button after failed validation attempt', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('re-enables Continue button once all step-1 fields are valid', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/name \*/i), {
      target: { name: 'name', value: 'John Doe' },
    });
    fireEvent.change(screen.getByLabelText(/age \*/i), {
      target: { name: 'age', value: '22' },
    });
    fireEvent.change(screen.getByLabelText(/nationality \*/i), {
      target: { name: 'nationality', value: 'Nigerian' },
    });
    const [regionSelect, positionSelect] = screen.getAllByRole('combobox');
    fireEvent.change(regionSelect, {
      target: { name: 'region', value: 'nigeria' },
    });
    fireEvent.change(positionSelect, {
      target: { name: 'position', value: 'ST' },
    });
    expect(
      screen.getByRole('button', { name: /continue/i }),
    ).not.toBeDisabled();
  });

  // ── aria attributes ────────────────────────────────────────────────────────

  it('sets aria-invalid on inputs that have errors', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByLabelText(/name \*/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText(/age \*/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText(/nationality \*/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('sets aria-describedby on the name input pointing to its error message', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    const nameInput = screen.getByLabelText(/name \*/i);
    const errorId = nameInput.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveTextContent(
      'Name is required',
    );
  });

  // ── Step 1 → Step 2 navigation ────────────────────────────────────────────

  it('advances to step 2 when step 1 data is valid', async () => {
    renderWizard();
    await act(async () => fillStep1AndAdvance());
    expect(
      screen.getByRole('heading', { name: /highlight reel/i }),
    ).toBeInTheDocument();
  });

  it('marks step 2 as active in the stepper after advancing', async () => {
    renderWizard();
    await act(async () => fillStep1AndAdvance());
    const stepCircles = screen
      .getAllByRole('generic')
      .filter((el) => el.getAttribute('aria-current') === 'step');
    expect(stepCircles[0]).toHaveTextContent('2');
  });

  it('does not show step 1 errors on step 2', async () => {
    renderWizard();
    await act(async () => fillStep1AndAdvance());
    expect(screen.queryByText('Name is required')).toBeNull();
  });

  // ── Step 2 ────────────────────────────────────────────────────────────────

  it('renders the VideoUpload component on step 2', async () => {
    renderWizard();
    await act(async () => fillStep1AndAdvance());
    expect(
      screen.getByRole('button', { name: /upload video/i }),
    ).toBeInTheDocument();
  });

  it('prevents advancing from step 2 without completing an upload', async () => {
    renderWizard();
    await act(async () => fillStep1AndAdvance());
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(
      screen.getByText(/please upload your highlight reel before continuing/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /highlight reel/i }),
    ).toBeInTheDocument();
  });

  it('advances to step 3 after a successful upload', async () => {
    renderWizard();
    await act(async () => fillStep1AndAdvance());
    fireEvent.click(screen.getByRole('button', { name: /upload video/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(
      screen.getByRole('heading', { name: /review & confirm/i }),
    ).toBeInTheDocument();
  });

  // ── Back navigation & state persistence ──────────────────────────────────

  it('navigates back from step 2 to step 1 preserving entered data', async () => {
    renderWizard();
    await act(async () => fillStep1AndAdvance());
    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(
      screen.getByRole('heading', { name: /personal information/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/name \*/i)).toHaveValue('John Doe');
    expect(screen.getByLabelText(/age \*/i)).toHaveValue(22);
    expect(screen.getByLabelText(/nationality \*/i)).toHaveValue('Nigerian');
  });

  it('navigates back from step 3 to step 2', async () => {
    renderWizard();
    await act(async () => fillStep1AndAdvance());
    fireEvent.click(screen.getByRole('button', { name: /upload video/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(
      screen.getByRole('heading', { name: /highlight reel/i }),
    ).toBeInTheDocument();
  });

  it('clears step errors when navigating back', async () => {
    renderWizard();
    await act(async () => fillStep1AndAdvance());
    // Trigger step 2 error
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(
      screen.getByText(/please upload your highlight reel/i),
    ).toBeInTheDocument();
    // Go back
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    // Come forward again — error should be gone until re-triggered
    await act(async () => fillStep1AndAdvance());
    expect(screen.queryByText(/please upload your highlight reel/i)).toBeNull();
  });

  // ── Step 3 review summary ─────────────────────────────────────────────────

  it('shows a read-only summary of all collected data on step 3', async () => {
    renderWizard();
    await act(async () => fillStep1AndAdvance());
    fireEvent.click(screen.getByRole('button', { name: /upload video/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('Nigerian')).toBeInTheDocument();
    // Region label
    expect(screen.getByText('Nigeria')).toBeInTheDocument();
    // Position label
    expect(screen.getByText('Striker')).toBeInTheDocument();
  });

  it('shows the truncated IPFS CID in the review summary', async () => {
    renderWizard();
    await act(async () => fillStep1AndAdvance());
    fireEvent.click(screen.getByRole('button', { name: /upload video/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // CID is 'QmTestCID1234567890' — displayed as QmTestCI…567890
    expect(screen.getByText('Highlight Reel (IPFS)')).toBeInTheDocument();
    expect(screen.getByText(/QmTestCI/)).toBeInTheDocument();
  });

  // ── Contract submission ───────────────────────────────────────────────────

  it('calls buildRegisterPlayer with correct vitals and CID on confirm', async () => {
    mockedBuildRegisterPlayer.mockResolvedValue('mock-xdr');
    const onSuccess = jest.fn();
    renderWizard(onSuccess);

    await act(async () => fillStep1AndAdvance());
    fireEvent.click(screen.getByRole('button', { name: /upload video/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /register as player/i }),
      );
    });

    expect(mockedBuildRegisterPlayer).toHaveBeenCalledWith(
      MOCK_PUBLIC_KEY,
      {
        name: 'John Doe',
        age: 22,
        position: 'ST',
        region: 'nigeria',
        nationality: 'Nigerian',
      },
      'QmTestCID1234567890',
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: expect.any(String),
        vitals: expect.objectContaining({
          name: 'John Doe',
          age: 22,
          position: 'ST',
          region: 'nigeria',
          nationality: 'Nigerian',
        }),
        ipfsHash: 'QmTestCID1234567890',
      }),
    );
  });

  it('shows an error message when contract submission fails', async () => {
    mockedBuildRegisterPlayer.mockRejectedValue(new Error('Contract error'));
    renderWizard();

    await act(async () => fillStep1AndAdvance());
    fireEvent.click(screen.getByRole('button', { name: /upload video/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /register as player/i }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Contract error')).toBeInTheDocument();
    });
  });

  it('shows a wallet-not-connected error without starting a transaction', async () => {
    mockedUseWallet.mockReturnValue({
      publicKey: null,
      isAuthenticated: false,
      isConnecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signAndSubmit: jest.fn(),
    } as any);

    render(<PlayerOnboardingWizard onSuccess={jest.fn()} />);
    await act(async () => fillStep1AndAdvance());
    fireEvent.click(screen.getByRole('button', { name: /upload video/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /register as player/i }),
      );
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Wallet not connected');
    expect(mockedBuildRegisterPlayer).not.toHaveBeenCalled();
  });

  it('disables the Back and Register buttons while submitting', async () => {
    let resolveContract: (val: string) => void;
    mockedBuildRegisterPlayer.mockReturnValue(
      new Promise((res) => {
        resolveContract = res;
      }),
    );

    renderWizard();
    await act(async () => fillStep1AndAdvance());
    fireEvent.click(screen.getByRole('button', { name: /upload video/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    fireEvent.click(
      screen.getByRole('button', { name: /register as player/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /registering/i }),
      ).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();

    await act(async () => {
      resolveContract!('mock-xdr');
    });
  });

  // ── Conditional rendering ─────────────────────────────────────────────────

  it('shows the wizard when the player has not yet registered', () => {
    setupWallet();
    const player: Player | null = null;

    render(
      <div>
        {player ? (
          <p data-testid="dashboard">Dashboard</p>
        ) : (
          <PlayerOnboardingWizard onSuccess={jest.fn()} />
        )}
      </div>,
    );

    expect(
      screen.getByRole('heading', { name: /personal information/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).toBeNull();
  });

  it('does not show the wizard when the player is already registered', () => {
    setupWallet();
    const player: Player = {
      id: 'player-1',
      wallet: MOCK_PUBLIC_KEY,
      vitals: {
        name: 'Existing Player',
        age: 25,
        position: 'ST',
        region: 'nigeria',
        nationality: 'Nigerian',
      },
      ipfsHash: 'QmExistingHash',
      progressLevel: 0,
      milestones: [],
      createdAt: 1234567890,
    };

    render(
      <div>
        {player ? (
          <p data-testid="dashboard">Dashboard</p>
        ) : (
          <PlayerOnboardingWizard onSuccess={jest.fn()} />
        )}
      </div>,
    );

    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /personal information/i }),
    ).toBeNull();
  });
});
