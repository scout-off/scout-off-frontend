import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  StrKey,
} from '@stellar/stellar-sdk';

const DEFAULT_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';

const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC ?? DEFAULT_SOROBAN_RPC_URL;
const NETWORK =
  process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
    ? Networks.PUBLIC
    : Networks.TESTNET;

export const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: false });

export function isValidStellarAddress(key: string): boolean {
  return StrKey.isValidEd25519PublicKey(key);
}

export { NETWORK, BASE_FEE, TransactionBuilder };

export class TransactionFailedError extends Error {
  constructor(hash: string) {
    super(`Transaction ${hash} failed on-chain`);
    this.name = 'TransactionFailedError';
  }
}

export class TransactionTimeoutError extends Error {
  constructor(hash: string, attempts: number) {
    super(`Transaction ${hash} was not confirmed after ${attempts} attempts`);
    this.name = 'TransactionTimeoutError';
  }
}

export async function pollTransaction(
  hash: string,
  maxAttempts = 10,
  delayMs = 3000,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await rpc.getTransaction(hash);
    if (result.status !== 'NOT_FOUND') {
      if (result.status === 'FAILED') {
        throw new TransactionFailedError(hash);
      }
      return result;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }
  throw new TransactionTimeoutError(hash, maxAttempts);
}

/**
 * Signs the provided XDR using `signFn`, submits it via the RPC node, polls
 * until the transaction is confirmed, and returns the final transaction result.
 */
const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

/**
 * Fetches the native XLM balance for a Stellar account via Horizon.
 * Returns 0 for unfunded accounts (404). Returns a number rounded to 7 decimal places.
 */
export async function getXLMBalance(address: string): Promise<number> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
  if (res.status === 404) return 0;
  if (!res.ok) throw new Error(`Horizon error: ${res.status}`);
  const { balances } = (await res.json()) as {
    balances: Array<{ asset_type: string; balance: string }>;
  };
  const native = balances.find((b) => b.asset_type === 'native');
  return native ? parseFloat(parseFloat(native.balance).toFixed(7)) : 0;
}

export async function signAndSubmitTx(
  xdrTx: string,
  signFn: (xdr: string) => Promise<string>,
) {
  const signedXdr = await signFn(xdrTx);
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK);
  const sendResult = await rpc.sendTransaction(tx);
  if (sendResult.status === 'ERROR') {
    throw new Error(`ContractError: ${JSON.stringify(sendResult)}`);
  }
  return pollTransaction(sendResult.hash);
}
