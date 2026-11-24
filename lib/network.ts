/**
 * The one place NEXT_PUBLIC_NETWORK is read (#1587). Any value other than
 * `mainnet` targets testnet everywhere; scripts/validate-env.js warns about
 * unrecognised values.
 *
 * The passphrases are inlined rather than imported from `@stellar/stellar-sdk`
 * so client components (e.g. context/WalletContext.tsx, mounted at the root
 * layout) can use this module without pulling the SDK into every page.
 */
export type StellarNetwork = 'mainnet' | 'testnet';

/** Same values as the SDK's `Networks.PUBLIC` / `Networks.TESTNET`. */
const PUBLIC_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

export const NETWORK: StellarNetwork =
  process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

export const isMainnet = (): boolean => NETWORK === 'mainnet';

export const getNetworkPassphrase = (): string =>
  isMainnet() ? PUBLIC_PASSPHRASE : TESTNET_PASSPHRASE;

/** stellar.expert's name for the network (`public` / `testnet`). */
const explorerNetwork = (): string => (isMainnet() ? 'public' : 'testnet');

export const getExplorerTxUrl = (hash: string): string =>
  `https://stellar.expert/explorer/${explorerNetwork()}/tx/${hash}`;

export const getExplorerAccountUrl = (account: string): string =>
  `https://stellar.expert/explorer/${explorerNetwork()}/account/${account}`;
