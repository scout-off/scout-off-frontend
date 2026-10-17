/** @jest-environment node */
import { Networks } from '@stellar/stellar-sdk';

const ORIGINAL = process.env.NEXT_PUBLIC_NETWORK;

function loadWith(value: string | undefined): typeof import('@/lib/network') {
  if (value === undefined) delete process.env.NEXT_PUBLIC_NETWORK;
  else process.env.NEXT_PUBLIC_NETWORK = value;
  let mod!: typeof import('@/lib/network');
  jest.isolateModules(() => {
    mod = require('@/lib/network');
  });
  return mod;
}

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_NETWORK;
  else process.env.NEXT_PUBLIC_NETWORK = ORIGINAL;
});

describe('lib/network', () => {
  it('targets mainnet when NEXT_PUBLIC_NETWORK=mainnet', () => {
    const net = loadWith('mainnet');
    expect(net.NETWORK).toBe('mainnet');
    expect(net.isMainnet()).toBe(true);
    expect(net.getNetworkPassphrase()).toBe(Networks.PUBLIC);
    expect(net.getExplorerTxUrl('abc')).toBe(
      'https://stellar.expert/explorer/public/tx/abc',
    );
    expect(net.getExplorerAccountUrl('GABC')).toBe(
      'https://stellar.expert/explorer/public/account/GABC',
    );
  });

  it('targets testnet when NEXT_PUBLIC_NETWORK=testnet', () => {
    const net = loadWith('testnet');
    expect(net.NETWORK).toBe('testnet');
    expect(net.isMainnet()).toBe(false);
    expect(net.getNetworkPassphrase()).toBe(Networks.TESTNET);
    expect(net.getExplorerTxUrl('abc')).toBe(
      'https://stellar.expert/explorer/testnet/tx/abc',
    );
  });

  it.each(['futurenet', 'MAINNET', '', undefined])(
    'falls back to testnet for an invalid value (%p)',
    (value) => {
      const net = loadWith(value);
      expect(net.NETWORK).toBe('testnet');
      expect(net.getNetworkPassphrase()).toBe(Networks.TESTNET);
    },
  );
});
