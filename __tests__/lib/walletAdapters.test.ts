import { walletAdapters } from '@/lib/walletAdapters';
import {
  getPublicKey as freighterGetPublicKey,
  isConnected as freighterIsConnected,
  signTransaction as freighterSign,
} from '@stellar/freighter-api';

jest.mock('@stellar/freighter-api', () => ({
  getPublicKey: jest.fn(),
  isConnected: jest.fn(),
  signTransaction: jest.fn(),
}));

const mockGetPublicKey = freighterGetPublicKey as jest.Mock;
const mockIsConnected = freighterIsConnected as jest.Mock;
const mockSign = freighterSign as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('walletAdapters.freighter', () => {
  it('returns the public key when Freighter is connected', async () => {
    mockIsConnected.mockResolvedValue(true);
    mockGetPublicKey.mockResolvedValue('GPUBLICKEY');

    await expect(walletAdapters.freighter.getPublicKey()).resolves.toBe(
      'GPUBLICKEY',
    );
  });

  it('throws when Freighter is not installed', async () => {
    mockIsConnected.mockResolvedValue(false);

    await expect(walletAdapters.freighter.getPublicKey()).rejects.toThrow(
      'Freighter not installed',
    );
    expect(mockGetPublicKey).not.toHaveBeenCalled();
  });

  it('signs a transaction using the network passphrase', async () => {
    mockSign.mockResolvedValue('signed-xdr');

    const result = await walletAdapters.freighter.signTransaction(
      'raw-xdr',
      'Test SDF Network ; September 2015',
    );

    expect(result).toBe('signed-xdr');
    expect(mockSign).toHaveBeenCalledWith('raw-xdr', {
      networkPassphrase: 'Test SDF Network ; September 2015',
    });
  });
});

describe('walletAdapters.albedo', () => {
  it('rejects getPublicKey as unconfigured', async () => {
    await expect(walletAdapters.albedo.getPublicKey()).rejects.toThrow(
      'Albedo adapter not configured',
    );
  });

  it('rejects signTransaction as unconfigured', async () => {
    await expect(
      walletAdapters.albedo.signTransaction('xdr', 'passphrase'),
    ).rejects.toThrow('Albedo adapter not configured');
  });
});

describe('walletAdapters.lobstr', () => {
  it('rejects getPublicKey as unconfigured', async () => {
    await expect(walletAdapters.lobstr.getPublicKey()).rejects.toThrow(
      'LOBSTR adapter not configured',
    );
  });

  it('rejects signTransaction as unconfigured', async () => {
    await expect(
      walletAdapters.lobstr.signTransaction('xdr', 'passphrase'),
    ).rejects.toThrow('LOBSTR adapter not configured');
  });
});
