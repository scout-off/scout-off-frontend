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
