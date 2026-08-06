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

jest.mock('@ledgerhq/hw-transport-webhid', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    isSupported: jest.fn(),
  },
}));

jest.mock('@ledgerhq/hw-app-str', () => {
  const mockStr = jest.fn().mockImplementation(() => ({
    getPublicKey: jest.fn(),
    signTransaction: jest.fn(),
  }));
  return { __esModule: true, default: mockStr };
});

jest.mock('@stellar/stellar-sdk', () => {
  const mockTx = {
    signatureBase: jest.fn().mockReturnValue(Buffer.from('sig_base')),
    addSignature: jest.fn(),
    toXDR: jest.fn().mockReturnValue('signed-xdr'),
  };

  return {
    ...jest.requireActual('@stellar/stellar-sdk'),
    StrKey: {
      encodeEd25519PublicKey: jest.fn(
        (buf: Buffer) => `G${buf.toString('hex').slice(0, 54)}`,
      ),
    },
    TransactionBuilder: {
      fromXDR: jest.fn().mockReturnValue(mockTx),
    },
  };
});

const mockGetPublicKey = freighterGetPublicKey as jest.Mock;
const mockIsConnected = freighterIsConnected as jest.Mock;
const mockSign = freighterSign as jest.Mock;

let mockWebHIDCreate: jest.Mock;
let mockStrInstance: {
  getPublicKey: jest.Mock;
  signTransaction: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  const TransportWebHID = jest.requireMock(
    '@ledgerhq/hw-transport-webhid',
  ).default;
  mockWebHIDCreate = TransportWebHID.create;
  mockWebHIDCreate.mockResolvedValue({
    close: jest.fn().mockResolvedValue(undefined),
  });

  const Str = jest.requireMock('@ledgerhq/hw-app-str').default;
  mockStrInstance = {
    getPublicKey: jest.fn(),
    signTransaction: jest.fn(),
  };
  Str.mockImplementation(() => mockStrInstance);
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
  it('rejects getPublicKey when the Albedo SDK returns no public key', async () => {
    await expect(walletAdapters.albedo.getPublicKey()).rejects.toThrow(
      'Albedo did not return a public key. Please try again.',
    );
  });

  it('rejects signTransaction when the Albedo SDK returns no signed envelope', async () => {
    await expect(
      walletAdapters.albedo.signTransaction('xdr', 'passphrase'),
    ).rejects.toThrow(
      'Albedo did not return a signed envelope. Please try again.',
    );
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

describe('walletAdapters.ledger', () => {
  beforeEach(() => {
    mockStrInstance.getPublicKey.mockResolvedValue({
      rawPublicKey: Buffer.from(
        'abc123def456abc123def456abc123def456abc123def456abc123def456',
        'hex',
      ),
    });
  });

  describe('getPublicKey', () => {
    it('returns the encoded public key from the device', async () => {
      const pk = await walletAdapters.ledger.getPublicKey();
      expect(pk).toMatch(/^G/);
      expect(mockStrInstance.getPublicKey).toHaveBeenCalledWith(
        "44'/148'/0'",
        false,
      );
    });

    it('closes the transport after success', async () => {
      const closeFn = jest.fn().mockResolvedValue(undefined);
      mockWebHIDCreate.mockResolvedValue({ close: closeFn });
      await walletAdapters.ledger.getPublicKey();
      expect(closeFn).toHaveBeenCalled();
    });

    it('closes the transport on error', async () => {
      const closeFn = jest.fn().mockResolvedValue(undefined);
      mockWebHIDCreate.mockResolvedValue({ close: closeFn });
      mockStrInstance.getPublicKey.mockRejectedValue(new Error('no device'));
      await expect(walletAdapters.ledger.getPublicKey()).rejects.toThrow(
        'Ledger device not detected',
      );
      expect(closeFn).toHaveBeenCalled();
    });

    it('maps "no device" errors to a user-friendly message', async () => {
      mockStrInstance.getPublicKey.mockRejectedValue(
        new Error('No WebHID device found'),
      );
      await expect(walletAdapters.ledger.getPublicKey()).rejects.toThrow(
        'Ledger device not detected',
      );
    });

    it('maps "user refused" errors to a user-friendly message', async () => {
      mockStrInstance.getPublicKey.mockRejectedValue(new Error('User refused'));
      await expect(walletAdapters.ledger.getPublicKey()).rejects.toThrow(
        'Request cancelled',
      );
    });

    it('maps "not supported" errors to a user-friendly message', async () => {
      mockWebHIDCreate.mockRejectedValue(new Error('WebHID is not supported'));
      await expect(walletAdapters.ledger.getPublicKey()).rejects.toThrow(
        'WebHID is not supported',
      );
    });
  });

  describe('signTransaction', () => {
    const MOCK_XDR = 'AAAAAgAAAAA...';
    const NETWORK = 'Test SDF Network ; September 2015';

    it('parses the XDR, signs, and returns a signed XDR', async () => {
      mockStrInstance.signTransaction.mockResolvedValue({
        signature: Buffer.from('signature_data'),
      });

      const result = await walletAdapters.ledger.signTransaction(
        MOCK_XDR,
        NETWORK,
      );
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('closes the transport after signing', async () => {
      const closeFn = jest.fn().mockResolvedValue(undefined);
      mockWebHIDCreate.mockResolvedValue({ close: closeFn });
      mockStrInstance.signTransaction.mockResolvedValue({
        signature: Buffer.from('sig'),
      });

      await walletAdapters.ledger.signTransaction(MOCK_XDR, NETWORK);
      expect(closeFn).toHaveBeenCalled();
    });

    it('throws a mapped error when signing fails', async () => {
      mockWebHIDCreate.mockRejectedValue(new Error('Failed to open'));
      await expect(
        walletAdapters.ledger.signTransaction(MOCK_XDR, NETWORK),
      ).rejects.toThrow('Ledger device not detected');
    });
  });
});
