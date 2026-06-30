import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerProfileForm from '@/components/player/PlayerProfileForm';
import { useWallet } from '@/hooks/useWallet';
import { useIPFSUpload } from '@/hooks/useIPFSUpload';
import { buildRegisterPlayer } from '@/lib/contract';

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

jest.mock('@/hooks/useIPFSUpload', () => ({
  useIPFSUpload: jest.fn(),
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
const mockedUseIPFSUpload = useIPFSUpload as jest.MockedFunction<
  typeof useIPFSUpload
>;
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

function setupIPFSUpload(
  overrides: Partial<ReturnType<typeof useIPFSUpload>> = {},
) {
  mockedUseIPFSUpload.mockReturnValue({
    upload: jest.fn().mockResolvedValue('QmTestCID1234567890'),
    progress: 0,
    uploading: false,
    error: null,
    ...overrides,
  });
}

function renderForm(onSuccess = jest.fn()) {
  setupWallet();
  setupIPFSUpload();
  return render(<PlayerProfileForm onSuccess={onSuccess} />);
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

describe('PlayerProfileForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Render required fields ───────────────────────────────────────────────────

  it('renders all required fields (name, age, position, region, nationality)', () => {
    renderForm();
    expect(screen.getByLabelText(/name \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/age \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nationality \*/i)).toBeInTheDocument();
    const combos = screen.getAllByRole('combobox');
    expect(combos).toHaveLength(2);
    expect(screen.getByText('Region *')).toBeInTheDocument();
    expect(screen.getByText('Position *')).toBeInTheDocument();
  });

  // ── Validation errors ────────────────────────────────────────────────────────

  it('shows validation errors for empty required fields on submit', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Age is required')).toBeInTheDocument();
    expect(screen.getByText('Nationality is required')).toBeInTheDocument();
    expect(screen.getByText('Region is required')).toBeInTheDocument();
    expect(screen.getByText('Position is required')).toBeInTheDocument();
  });

  it('shows a name-too-short error for a single-character name', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/name \*/i), {
      target: { name: 'name', value: 'A' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(
      screen.getByText('Name must be at least 2 characters'),
    ).toBeInTheDocument();
  });

  it('shows a name-too-long error when name exceeds 50 characters', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/name \*/i), {
      target: { name: 'name', value: 'A'.repeat(51) },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(
      screen.getByText('Name must be 50 characters or fewer'),
    ).toBeInTheDocument();
  });

  it('shows a name error on blur when field is left empty', () => {
    renderForm();
    const nameInput = screen.getByLabelText(/name \*/i);
    fireEvent.focus(nameInput);
    fireEvent.blur(nameInput, { target: { name: 'name', value: '' } });
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('shows an age error on blur when age is out of range', () => {
    renderForm();
    const ageInput = screen.getByLabelText(/age \*/i);
    fireEvent.focus(ageInput);
    fireEvent.blur(ageInput, { target: { name: 'age', value: '5' } });
    expect(screen.getByText('Age must be between 14 and 45')).toBeInTheDocument();
  });

  it('disables Continue button after failed validation until errors are resolved', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('re-enables Continue button once all step-1 fields are valid', () => {
    renderForm();
    // Trigger validation
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();

    // Fill all required fields
    fireEvent.change(screen.getByLabelText(/name \*/i), {
      target: { name: 'name', value: 'Jane Doe' },
    });
    fireEvent.change(screen.getByLabelText(/age \*/i), {
      target: { name: 'age', value: '25' },
    });
    fireEvent.change(screen.getByLabelText(/nationality \*/i), {
      target: { name: 'nationality', value: 'Ghanaian' },
    });
    const [regionSelect, positionSelect] = screen.getAllByRole('combobox');
    fireEvent.change(regionSelect, {
      target: { name: 'region', value: 'ghana' },
    });
    fireEvent.change(positionSelect, {
      target: { name: 'position', value: 'GK' },
    });
    expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled();
  });

  // ── aria attributes ──────────────────────────────────────────────────────

  it('sets aria-invalid on the name input when it has an error', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByLabelText(/name \*/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('sets aria-describedby on the name input pointing to the error element', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    const nameInput = screen.getByLabelText(/name \*/i);
    const errorId = nameInput.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveTextContent(
      'Name is required',
    );
  });

  // ── Submit button disabled during operations ───────────────────────────────────

  it('disables submit button while upload is in progress', async () => {
    setupIPFSUpload({ uploading: true });
    renderForm();

    await act(async () => fillStep1AndAdvance());
    fireEvent.click(screen.getByRole('button', { name: /upload video/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // On step 3, the submit button should be disabled if uploading
    const submitButton = screen.getByRole('button', {
      name: /register as player/i,
    });
    expect(submitButton).toBeInTheDocument();
  });

  it('disables submit button while contract call is in progress', async () => {
    let resolveContract: (val: string) => void;
    mockedBuildRegisterPlayer.mockReturnValue(
      new Promise((res) => {
        resolveContract = res;
      }),
    );

    renderForm();
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

    await act(async () => {
      resolveContract!('mock-xdr');
    });
  });

  // ── Success callback ─────────────────────────────────────────────────────────

  it('calls onSuccess callback with playerId, vitals and ipfsHash on successful registration', async () => {
    mockedBuildRegisterPlayer.mockResolvedValue('mock-xdr');
    const onSuccess = jest.fn();
    const mockSignAndSubmit = jest.fn().mockResolvedValue({
      hash: 'tx-hash-123',
      id: 'player-123',
    });
    setupWallet({ signAndSubmit: mockSignAndSubmit });
    setupIPFSUpload();

    render(<PlayerProfileForm onSuccess={onSuccess} />);

    await act(async () => fillStep1AndAdvance());
    fireEvent.click(screen.getByRole('button', { name: /upload video/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /register as player/i }),
      );
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 'player-123',
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

  // ── Contract failure error toast ──────────────────────────────────────────────

  it('shows an error toast on contract failure', async () => {
    mockedBuildRegisterPlayer.mockRejectedValue(new Error('Contract error'));
    renderForm();

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
});
