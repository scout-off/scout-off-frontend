import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

process.env.NEXT_PUBLIC_SOROBAN_RPC = 'https://soroban-testnet.stellar.org';
process.env.NEXT_PUBLIC_NETWORK = 'testnet';
process.env.NEXT_PUBLIC_CONTRACT_ID =
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
process.env.NEXT_PUBLIC_IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk') as any;
  return {
    ...original,
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn(),
    })),
  };
});
