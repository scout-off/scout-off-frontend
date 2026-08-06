import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import BulkPlayerImport from '@/components/academy/BulkPlayerImport';
import { useWallet } from '@/hooks/useWallet';
import { buildRegisterPlayer } from '@/lib/contract';

// ── Mocks ─────────────────────────────────────────────────────────────────────

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

const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedBuildRegisterPlayer = buildRegisterPlayer as jest.MockedFunction<
  typeof buildRegisterPlayer
>;
const mockedUseIsPaused = require('@/hooks/useIsPaused').default as jest.Mock;

const MOCK_PUBLIC_KEY = 'GACADEMYWALLET1234567890';

function setupWallet(overrides: Partial<ReturnType<typeof useWallet>> = {}) {
  mockedUseWallet.mockReturnValue({
    publicKey: MOCK_PUBLIC_KEY,
    isAuthenticated: true,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSubmit: jest.fn().mockResolvedValue({ hash: 'tx-hash-abc' }),
    ...overrides,
  } as any);
}

/** Helper: builds a File the same way a real <input type="file"> change event would. */
function makeFile(content: string, name: string, type = 'text/csv') {
  return new File([content], name, { type });
}

async function uploadFile(content: string, name: string, type?: string) {
  const input = screen.getByLabelText(/player file/i) as HTMLInputElement;
  const file = makeFile(content, name, type);
  fireEvent.change(input, { target: { files: [file] } });
  // FileReader resolves via a real macrotask in jsdom, not a microtask, so
  // fireEvent's implicit act() wrapper won't wait for it — poll instead.
  await waitFor(() => {
    expect(
      screen.queryByRole('table') || screen.queryByRole('alert'),
    ).toBeTruthy();
  });
}

const VALID_CSV = [
  'name,age,nationality,region,position',
  'John Doe,22,Nigerian,nigeria,ST',
  'Jane Smith,19,Kenyan,kenya,GK',
].join('\n');

const MIXED_CSV = [
  'name,age,nationality,region,position',
  'John Doe,22,Nigerian,nigeria,ST',
  ',22,Nigerian,nigeria,ST',
  'Jane Smith,19,Kenyan,kenya,GK',
].join('\n');

describe('BulkPlayerImport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseIsPaused.mockReturnValue(false);
    setupWallet();
  });

  // ── Upload + parsing ─────────────────────────────────────────────────────

  it('renders the file upload control initially with no preview table', () => {
    render(<BulkPlayerImport />);
    expect(screen.getByLabelText(/player file/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows a staged preview table after uploading a valid CSV, before any wallet interaction', async () => {
    render(<BulkPlayerImport />);
    await uploadFile(VALID_CSV, 'players.csv');

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(
      screen.getByText(/2 valid · 0 invalid · 2 total/i),
    ).toBeInTheDocument();
    // No signing has happened yet
    expect(mockedBuildRegisterPlayer).not.toHaveBeenCalled();
  });

  it('distinguishes valid and invalid rows in the preview, with per-row error reasons', async () => {
    render(<BulkPlayerImport />);
    await uploadFile(MIXED_CSV, 'players.csv');

    expect(
      screen.getByText(/2 valid · 1 invalid · 3 total/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Valid').length).toBe(2);
    expect(screen.getByText('Invalid')).toBeInTheDocument();
    expect(screen.getByText(/name: Name is required/i)).toBeInTheDocument();
  });

  it('shows a file-level error and no table for a malformed JSON file', async () => {
    render(<BulkPlayerImport />);
    await uploadFile('{not json', 'players.json', 'application/json');

    expect(screen.getByRole('alert')).toHaveTextContent(/not valid json/i);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lets the admin choose another file to reset the preview', async () => {
    render(<BulkPlayerImport />);
    await uploadFile(VALID_CSV, 'players.csv');
    expect(screen.getByRole('table')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /choose another file/i }),
    );
    expect(screen.queryByRole('table')).toBeNull();
  });

  // ── Sequential submission ────────────────────────────────────────────────

  it('submits one buildRegisterPlayer + signAndSubmit call per valid row, sequentially', async () => {
    mockedBuildRegisterPlayer.mockResolvedValue('mock-xdr');
    const signAndSubmit = jest.fn().mockResolvedValue({ hash: 'tx-hash-1' });
    setupWallet({ signAndSubmit });

    render(<BulkPlayerImport />);
    await uploadFile(VALID_CSV, 'players.csv');

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /import 2 valid players/i }),
      );
    });

    await waitFor(() => {
      expect(mockedBuildRegisterPlayer).toHaveBeenCalledTimes(2);
    });
    expect(signAndSubmit).toHaveBeenCalledTimes(2);

    expect(mockedBuildRegisterPlayer).toHaveBeenNthCalledWith(
      1,
      MOCK_PUBLIC_KEY,
      {
        name: 'John Doe',
        age: 22,
        position: 'ST',
        region: 'nigeria',
        nationality: 'Nigerian',
      },
      '',
    );
    expect(mockedBuildRegisterPlayer).toHaveBeenNthCalledWith(
      2,
      MOCK_PUBLIC_KEY,
      {
        name: 'Jane Smith',
        age: 19,
        position: 'GK',
        region: 'kenya',
        nationality: 'Kenyan',
      },
      '',
    );

    await waitFor(() => {
      expect(screen.getByText(/import complete/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/2 registered, 0 failed, 0 skipped/i),
    ).toBeInTheDocument();
  });

  it('continues the batch after one row fails or is rejected, and summarizes results', async () => {
    mockedBuildRegisterPlayer.mockResolvedValue('mock-xdr');
    const signAndSubmit = jest
      .fn()
      .mockResolvedValueOnce({ hash: 'tx-hash-1' })
      .mockRejectedValueOnce(new Error('User declined access'));
    setupWallet({ signAndSubmit });

    render(<BulkPlayerImport />);
    await uploadFile(VALID_CSV, 'players.csv');

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /import 2 valid players/i }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/import complete/i)).toBeInTheDocument();
    });

    // Batch continued to the second row despite the first... wait, order: row1 succeeds, row2 fails.
    expect(signAndSubmit).toHaveBeenCalledTimes(2);
    expect(mockedBuildRegisterPlayer).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText(/1 registered, 1 failed, 0 skipped/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Registered').length).toBe(1);
    expect(screen.getAllByText('Failed').length).toBe(1);
  });

  it('skips invalid rows during submission and only signs for valid ones', async () => {
    mockedBuildRegisterPlayer.mockResolvedValue('mock-xdr');
    const signAndSubmit = jest.fn().mockResolvedValue({ hash: 'tx-hash-1' });
    setupWallet({ signAndSubmit });

    render(<BulkPlayerImport />);
    await uploadFile(MIXED_CSV, 'players.csv');

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /import 2 valid players/i }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/import complete/i)).toBeInTheDocument();
    });

    expect(mockedBuildRegisterPlayer).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText(/2 registered, 0 failed, 1 skipped/i),
    ).toBeInTheDocument();
  });

  it('does not start signing when no wallet is connected', async () => {
    setupWallet({ publicKey: null, signAndSubmit: jest.fn() });
    render(<BulkPlayerImport />);
    await uploadFile(VALID_CSV, 'players.csv');

    const importButton = screen.getByRole('button', {
      name: /import 2 valid players/i,
    });
    expect(importButton).toBeDisabled();
  });

  it('disables import while the contract is paused', async () => {
    mockedUseIsPaused.mockReturnValue(true);
    render(<BulkPlayerImport />);
    await uploadFile(VALID_CSV, 'players.csv');

    expect(
      screen.getByRole('button', { name: /import 2 valid players/i }),
    ).toBeDisabled();
  });

  it('disables the import and reset controls once submission is in progress', async () => {
    mockedBuildRegisterPlayer.mockResolvedValue('mock-xdr');
    let resolveSign: (val: unknown) => void;
    const signAndSubmit = jest.fn().mockImplementation(
      () =>
        new Promise((res) => {
          resolveSign = res;
        }),
    );
    setupWallet({ signAndSubmit });

    render(<BulkPlayerImport />);
    await uploadFile(VALID_CSV, 'players.csv');

    fireEvent.click(
      screen.getByRole('button', { name: /import 2 valid players/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /importing/i })).toBeDisabled();
    });
    expect(
      screen.getByRole('button', { name: /choose another file/i }),
    ).toBeDisabled();

    await act(async () => {
      resolveSign!({ hash: 'tx-hash-1' });
    });
  });
});
