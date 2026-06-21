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
