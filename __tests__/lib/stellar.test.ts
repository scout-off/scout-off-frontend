import { Networks } from '@stellar/stellar-sdk';

const mockGetTransaction = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    SorobanRpc: {
      Server: jest.fn().mockImplementation(() => ({
        getTransaction: mockGetTransaction,
      })),
    },
  };
});

describe('lib/stellar', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetTransaction.mockReset();
  });

  test('uses NEXT_PUBLIC_SOROBAN_RPC for SorobanRpc.Server', () => {
    const mockRpcUrl = 'https://test.soroban.rpc';
    process.env.NEXT_PUBLIC_SOROBAN_RPC = mockRpcUrl;
    process.env.NEXT_PUBLIC_NETWORK = 'testnet';

    require('@/lib/stellar');

    const { SorobanRpc } = require('@stellar/stellar-sdk');
    expect(SorobanRpc.Server).toHaveBeenCalledWith(mockRpcUrl, {
      allowHttp: false,
    });
  });

  test('NETWORK is TESTNET when NEXT_PUBLIC_NETWORK is testnet', () => {
    process.env.NEXT_PUBLIC_SOROBAN_RPC = 'https://test.soroban.rpc';
    process.env.NEXT_PUBLIC_NETWORK = 'testnet';

    const { NETWORK } = require('@/lib/stellar');

    expect(NETWORK).toBe(Networks.TESTNET);
  });

  test('NETWORK is PUBLIC when NEXT_PUBLIC_NETWORK is mainnet', () => {
    process.env.NEXT_PUBLIC_SOROBAN_RPC = 'https://main.soroban.rpc';
    process.env.NEXT_PUBLIC_NETWORK = 'mainnet';

    const { NETWORK } = require('@/lib/stellar');

    expect(NETWORK).toBe(Networks.PUBLIC);
  });
});

describe('pollTransaction', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetTransaction.mockReset();
    process.env.NEXT_PUBLIC_SOROBAN_RPC = 'https://test.soroban.rpc';
    process.env.NEXT_PUBLIC_NETWORK = 'testnet';
  });

  test('resolves with result when transaction status is SUCCESS', async () => {
    const successResult = { status: 'SUCCESS', returnValue: 'mock' };
    mockGetTransaction.mockResolvedValueOnce(successResult);

    const { pollTransaction } = require('@/lib/stellar');
    const result = await pollTransaction('abc123', 3, 0);

    expect(result).toBe(successResult);
    expect(mockGetTransaction).toHaveBeenCalledTimes(1);
  });

  test('retries on NOT_FOUND and resolves on subsequent SUCCESS', async () => {
    mockGetTransaction
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'SUCCESS', returnValue: 'ok' });

    const { pollTransaction } = require('@/lib/stellar');
    const result = await pollTransaction('abc123', 5, 0);

    expect(result.status).toBe('SUCCESS');
    expect(mockGetTransaction).toHaveBeenCalledTimes(3);
  });

  test('throws TransactionFailedError when status is FAILED', async () => {
    mockGetTransaction.mockResolvedValueOnce({ status: 'FAILED' });

    const {
      pollTransaction,
      TransactionFailedError,
    } = require('@/lib/stellar');
    await expect(pollTransaction('abc123', 3, 0)).rejects.toThrow(
      TransactionFailedError,
    );
  });

  test('throws TransactionTimeoutError after max attempts with only NOT_FOUND', async () => {
    mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' });

    const {
      pollTransaction,
      TransactionTimeoutError,
    } = require('@/lib/stellar');
    await expect(pollTransaction('abc123', 3, 0)).rejects.toThrow(
      TransactionTimeoutError,
    );
    expect(mockGetTransaction).toHaveBeenCalledTimes(3);
  });

  test('TransactionTimeoutError message includes the hash', async () => {
    mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' });

    const { pollTransaction } = require('@/lib/stellar');
    await expect(pollTransaction('deadbeef', 2, 0)).rejects.toThrow('deadbeef');
  });

  test('TransactionFailedError message includes the hash', async () => {
    mockGetTransaction.mockResolvedValueOnce({ status: 'FAILED' });

    const { pollTransaction } = require('@/lib/stellar');
    await expect(pollTransaction('cafebabe', 2, 0)).rejects.toThrow('cafebabe');
  });
});

describe('getXLMBalance', () => {
  const mockFetch = jest.fn();
  const originalEnv = process.env.NEXT_PUBLIC_HORIZON_URL;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_HORIZON_URL = 'https://horizon-testnet.stellar.org';
    global.fetch = mockFetch as any;
  });

  afterAll(() => {
    if (originalEnv) {
      process.env.NEXT_PUBLIC_HORIZON_URL = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_HORIZON_URL;
    }
  });

  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
  });

  it('returns the native XLM balance for a funded account', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        balances: [
          { asset_type: 'native', balance: '42.567891234' },
          { asset_type: 'credit_alphanum4', balance: '10.00' },
        ],
      }),
    });

    const { getXLMBalance } = require('@/lib/stellar');
    const balance = await getXLMBalance('GABCDEF1234567890');

    expect(balance).toBe(42.5678912);
  });

  it('returns 0 for an unfunded account (404)', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 404,
      ok: false,
    });

    const { getXLMBalance } = require('@/lib/stellar');
    const balance = await getXLMBalance('GUNFUNDED123456789');

    expect(balance).toBe(0);
  });

  it('throws on non-404 server errors', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 500,
      ok: false,
    });

    const { getXLMBalance } = require('@/lib/stellar');
    await expect(getXLMBalance('GERROR1234567890')).rejects.toThrow(
      'Horizon error: 500',
    );
  });

  it('returns 0 when no native balance is found', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        balances: [{ asset_type: 'credit_alphanum4', balance: '100.00' }],
      }),
    });

    const { getXLMBalance } = require('@/lib/stellar');
    const balance = await getXLMBalance('GNONATIVE12345678');

    expect(balance).toBe(0);
  });
});
