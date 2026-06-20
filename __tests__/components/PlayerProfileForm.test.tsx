import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerProfileForm from '@/components/player/PlayerProfileForm';
import { AFRICAN_REGIONS } from '@/lib/regions';
// NOTE: Import the named buildRegisterPlayer explicitly so subsequent
// maintainers don't "auto-fix" this to `import * as contract from '@/lib/contract'`.
// The mock below is registered against the same module path the component reads from.
import { buildRegisterPlayer } from '@/lib/contract';
import { useWallet } from '@/hooks/useWallet';
import useIsPaused from '@/hooks/useIsPaused';

jest.mock('@/components/ui/VideoUpload', () => ({
  __esModule: true,
  default: ({ onUpload }: { onUpload: (cid: string) => void }) => (
    <button type="button" onClick={() => onUpload('Qmtestcid1234567890')}>
      Upload highlight reel
    </button>
  ),
}));

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
  default: jest.fn(),
}));

jest.mock('@/lib/contract', () => ({
  buildRegisterPlayer: jest.fn(),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitize: (v: string) => v,
}));

const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedUseIsPaused = useIsPaused as jest.MockedFunction<
  typeof useIsPaused
>;
const mockedBuildRegisterPlayer = buildRegisterPlayer as jest.MockedFunction<
  typeof buildRegisterPlayer
>;

const WALLET = 'GABC123PUBLICKEY';
// Pick the first region from the canonical constant so this test stays valid if
// lib/regions.ts ever renames the slug for "Nigeria" to e.g. "ng".
const REGION_VALUE = AFRICAN_REGIONS[0].value;

beforeEach(() => {
  jest.clearAllMocks();
  mockedBuildRegisterPlayer.mockResolvedValue('xdr-string');
  mockedUseWallet.mockReturnValue({
    publicKey: WALLET,
    isAuthenticated: true,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSubmit: jest.fn().mockResolvedValue({
      hash: 'tx-hash',
      id: 'player-id',
    }),
  } as any);
  mockedUseIsPaused.mockReturnValue(false);
});

function renderForm(onSuccess = jest.fn()) {
  return render(<PlayerProfileForm onSuccess={onSuccess} />);
}

function fillRequiredFields({ nationality }: { nationality: string }) {
  fireEvent.change(screen.getByPlaceholderText(/full name/i), {
    target: { value: 'Ada Lovelace' },
  });
  fireEvent.change(screen.getByPlaceholderText(/enter your age/i), {
    target: { value: '21' },
  });
  fireEvent.change(screen.getByPlaceholderText(/enter your nationality/i), {
    target: { value: nationality },
  });
  // Position + Region use the <Select> primitive — fire change on the underlying <select>
  const selects = screen.getAllByRole('combobox');
  fireEvent.change(selects[0], { target: { value: 'ST' } });
  fireEvent.change(selects[1], { target: { value: REGION_VALUE } });
  fireEvent.click(
    screen.getByRole('button', { name: /upload highlight reel/i }),
  );
}

describe('PlayerProfileForm — nationality field (Issue #301)', () => {
  it('renders a Nationality input', () => {
    renderForm();
    expect(
      screen.getByPlaceholderText(/enter your nationality/i),
    ).toBeInTheDocument();
  });

  it('shows a validation error and does not submit when nationality is empty', async () => {
    renderForm();

    fillRequiredFields({ nationality: '' });

    const submit = screen.getByRole('button', {
      name: /register as player/i,
    });
    await act(async () => {
      fireEvent.click(submit);
    });

    expect(
      await screen.findByText(/Nationality is required/i),
    ).toBeInTheDocument();
    expect(mockedBuildRegisterPlayer).not.toHaveBeenCalled();
  });

  it('shows a validation error when nationality is only whitespace', async () => {
    renderForm();
    fillRequiredFields({ nationality: '   ' });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /register as player/i }),
      );
    });

    expect(
      await screen.findByText(/Nationality is required/i),
    ).toBeInTheDocument();
    expect(mockedBuildRegisterPlayer).not.toHaveBeenCalled();
  });

  it('passes the entered nationality to buildRegisterPlayer', async () => {
    renderForm();

    fillRequiredFields({ nationality: 'Nigerian' });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /register as player/i }),
      );
    });

    await waitFor(() =>
      expect(mockedBuildRegisterPlayer).toHaveBeenCalledTimes(1),
    );

    const [, vitals] = mockedBuildRegisterPlayer.mock.calls[0];
    expect(vitals).toEqual(
      expect.objectContaining({
        name: 'Ada Lovelace',
        age: 21,
        position: 'ST',
        region: REGION_VALUE,
        nationality: 'Nigerian',
      }),
    );
  });

  it('does not hardcode nationality as an empty string anywhere in the vitals', async () => {
    renderForm();
    fillRequiredFields({ nationality: 'Kenyan' });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /register as player/i }),
      );
    });

    await waitFor(() =>
      expect(mockedBuildRegisterPlayer).toHaveBeenCalled(),
    );
    const [, vitals] = mockedBuildRegisterPlayer.mock.calls[0];
    expect(vitals.nationality).toBe('Kenyan');
    expect(vitals.nationality).not.toBe('');
  });
});
