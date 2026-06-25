import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
} from '@stellar/stellar-sdk';

const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC!;
const NETWORK =
  process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
    ? Networks.PUBLIC
    : Networks.TESTNET;

export const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: false });

export function isValidStellarAddress(key: string): boolean {
  return StrKey.isValidEd25519PublicKey(key);
}

export { NETWORK, BASE_FEE, TransactionBuilder };

// 21 attempts with 1.5s between each = 30s of total wait before timing out.
const DEFAULT_MAX_ATTEMPTS = 21;
const DEFAULT_DELAY_MS = 1500;

export class TransactionTimeoutError extends Error {
  constructor(hash: string) {
    super(`Transaction ${hash} was not confirmed within the allotted time.`);
    this.name = 'TransactionTimeoutError';
  }
}

export class TransactionFailedError extends Error {
  constructor(hash: string) {
    super(`Transaction ${hash} failed.`);
    this.name = 'TransactionFailedError';
  }
}

/**
 * Polls `rpc.getTransaction` until the transaction is confirmed, fails, or
 * `maxAttempts` is exhausted. Stellar takes a few seconds to confirm a
 * transaction, so calling `getTransaction` immediately after `sendTransaction`
 * almost always returns `NOT_FOUND`.
 */
export async function pollTransaction(
  hash: string,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
  delayMs: number = DEFAULT_DELAY_MS,
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
  throw new TransactionTimeoutError(hash);
}

/**
 * Signs the provided XDR using `signFn`, submits it via the RPC node, polls
 * until the transaction is confirmed, and returns the final transaction result.
 */
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
