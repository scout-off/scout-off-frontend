import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

process.env.NEXT_PUBLIC_SOROBAN_RPC = 'https://soroban-testnet.stellar.org';
process.env.NEXT_PUBLIC_NETWORK = 'testnet';
process.env.NEXT_PUBLIC_CONTRACT_ID =
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
process.env.NEXT_PUBLIC_IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const t: Record<string, string> = {
      app_title: 'ScoutOff',
      'nav.scout_dashboard': 'Scout Dashboard',
      'nav.player_dashboard': 'Player Dashboard',
    };
    return t[key] ?? key;
  },
  useLocale: () => 'en',
  useMessages: () => ({}),
  useNow: () => new Date(),
  useTimeZone: () => 'UTC',
  useFormatter: () => ({}),
}));

jest.mock('@albedo-link/intent', () => ({
  albedo: {
    publicKey: jest.fn(),
    tx: jest.fn(),
  },
}));

jest.mock('@lobstrco/signer-extension-api', () => ({
  isConnected: jest.fn(),
  getPublicKey: jest.fn(),
  signTransaction: jest.fn(),
}));

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk') as any;
  return {
    ...original,
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn(),
    })),
  };
});
