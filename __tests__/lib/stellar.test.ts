import { Networks } from '@stellar/stellar-sdk';

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    SorobanRpc: {
      Server: jest.fn(),
    },
  };
});

describe('lib/stellar', () => {
  beforeEach(() => {
    jest.resetModules();
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

describe('lib/stellar — pollTransaction', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_SOROBAN_RPC = 'https://test.soroban.rpc';
    process.env.NEXT_PUBLIC_NETWORK = 'testnet';
  });

  test('returns the result once status is SUCCESS', async () => {
    const { rpc, pollTransaction } = require('@/lib/stellar');
    rpc.getTransaction = jest
      .fn()
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'SUCCESS', returnValue: 'ok' });

    const result = await pollTransaction('hash-1', 5, 0);

    expect(result).toEqual({ status: 'SUCCESS', returnValue: 'ok' });
    expect(rpc.getTransaction).toHaveBeenCalledTimes(2);
  });

  test('throws TransactionFailedError when status is FAILED', async () => {
    const { rpc, pollTransaction, TransactionFailedError } = require('@/lib/stellar');
    rpc.getTransaction = jest.fn().mockResolvedValue({ status: 'FAILED' });

    await expect(pollTransaction('hash-2', 5, 0)).rejects.toBeInstanceOf(
      TransactionFailedError,
    );
  });

  test('throws TransactionTimeoutError after maxAttempts of NOT_FOUND', async () => {
    const { rpc, pollTransaction, TransactionTimeoutError } = require('@/lib/stellar');
    rpc.getTransaction = jest.fn().mockResolvedValue({ status: 'NOT_FOUND' });

    await expect(pollTransaction('hash-3', 3, 0)).rejects.toBeInstanceOf(
      TransactionTimeoutError,
    );
    expect(rpc.getTransaction).toHaveBeenCalledTimes(3);
  });
});
