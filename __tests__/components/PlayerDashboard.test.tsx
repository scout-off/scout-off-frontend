import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerDashboard from '@/app/[locale]/player/page';
import { buildRegisterPlayer } from '@/lib/contract';
import { uploadToIPFS } from '@/lib/ipfs';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { useWallet } from '@/hooks/useWallet';
import { usePlayer } from '@/hooks/usePlayer';
import { AFRICAN_REGIONS } from '@/lib/regions';

// Mock next-intl entirely so the test doesn't try to load next-intl's ESM runtime
// (which Jest can't transform without extra config). The mock resolves translations
// against the real English JSON so DOM queries match actual strings ("Full name",
// "Position", etc.) rather than i18n key paths.
jest.mock('next-intl', () => {
  const en = require('@/messages/en.json');
  function lookup(obj: any, parts: string[]): string {
    let cur = obj;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
      else return parts.join('.');
    }
    return typeof cur === 'string' ? cur : parts.join('.');
  }
  return {
    __esModule: true,
    useTranslations:
      (namespace = '') =>
      (key: string): string => {
        const parts = namespace
          ? [...namespace.split('.'), ...key.split('.')]
          : key.split('.');
        return lookup(en, parts);
      },
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

jest.mock('@/hooks/useRequireWallet', () => ({
  __esModule: true,
  useRequireWallet: jest.fn(),
}));

jest.mock('@/hooks/usePlayer', () => ({
  __esModule: true,
  usePlayer: jest.fn(),
}));

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/lib/ipfs', () => ({
  uploadToIPFS: jest.fn(),
}));

jest.mock('@/lib/contract', () => ({
  buildRegisterPlayer: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

const mockedUseRequireWallet = useRequireWallet as jest.MockedFunction<
  typeof useRequireWallet
>;
const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedUsePlayer = usePlayer as jest.MockedFunction<typeof usePlayer>;
const mockedUploadToIPFS = uploadToIPFS as jest.MockedFunction<
  typeof uploadToIPFS
>;
const mockedBuildRegisterPlayer = buildRegisterPlayer as jest.MockedFunction<
  typeof buildRegisterPlayer
>;

const WALLET = 'GABC123PUBLICKEY';
const REGION = AFRICAN_REGIONS[0].value;

beforeEach(() => {
  jest.clearAllMocks();
  mockedBuildRegisterPlayer.mockResolvedValue('xdr-string');
  mockedUploadToIPFS.mockResolvedValue('Qmtestcid1234567890');
  mockedUseRequireWallet.mockReturnValue({ walletAddress: WALLET });
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
  mockedUsePlayer.mockReturnValue({
    player: null,
    loading: false,
    error: null,
    refetch: jest.fn(),
  });
});

function fillAllFields({
  age = '21',
  nationality = 'Nigerian',
}: { age?: string; nationality?: string } = {}) {
  fireEvent.change(screen.getByPlaceholderText(/full name/i), {
    target: { value: 'Ada Lovelace' },
  });
  fireEvent.change(screen.getByPlaceholderText(/position/i), {
    target: { value: 'ST' },
  });
  fireEvent.change(screen.getByPlaceholderText(/region/i), {
    target: { value: REGION },
  });    fireEvent.change(screen.getByPlaceholderText(/enter your age/i), {
      target: { value: age },
    });
    fireEvent.change(screen.getByPlaceholderText(/nationality/i), {
      target: { value: nationality },
    });
  fireEvent.change(screen.getByLabelText(/highlight reel/i), {
    target: { files: [new File(['x'], 'clip.mp4', { type: 'video/mp4' })] },
  });
}

describe('PlayerDashboard inline registration form — Issue #301 (nationality)', () => {
  it('renders a Nationality field in the inline form', () => {
    render(<PlayerDashboard />);
    expect(screen.getByText(/nationality/i)).toBeInTheDocument();
  });

  it('shows a validation error and does not submit when nationality is empty', async () => {
    render(<PlayerDashboard />);

    fillAllFields({ nationality: '' });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /register on stellar/i }),
      );
    });

    expect(
      await screen.findByText(/Nationality is required/i),
    ).toBeInTheDocument();
    expect(mockedBuildRegisterPlayer).not.toHaveBeenCalled();
    expect(mockedUploadToIPFS).not.toHaveBeenCalled();
  });

  it('shows the age-out-of-range error when age is < 14 or > 45', async () => {
    render(<PlayerDashboard />);

    fillAllFields({ age: '10' });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /register on stellar/i }),
      );
    });

    expect(
      await screen.findByText(/between 14 and 45/i),
    ).toBeInTheDocument();
    expect(mockedBuildRegisterPlayer).not.toHaveBeenCalled();
  });

  it('passes the entered nationality (no empty-string hardcode) to buildRegisterPlayer', async () => {
    render(<PlayerDashboard />);

    fillAllFields({ nationality: 'Nigerian' });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /register on stellar/i }),
      );
    });

    await waitFor(() =>
      expect(mockedBuildRegisterPlayer).toHaveBeenCalledTimes(1),
    );

    const [, vitals] = mockedBuildRegisterPlayer.mock.calls[0];
    expect(vitals).toEqual({
      name: 'Ada Lovelace',
      position: 'ST',
      region: REGION,
      age: 21,
      nationality: 'Nigerian',
    });
    expect(vitals.nationality).not.toBe('');
  });
});
