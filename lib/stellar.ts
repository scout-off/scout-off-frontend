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

async function pollTransaction(hash: string) {
  const MAX_ATTEMPTS = 10;
  const POLL_DELAY_MS = 1500;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await rpc.getTransaction(hash);
    if (result.status !== 'NOT_FOUND') {
      if (result.status === 'FAILED') {
        throw new Error(`ContractError: transaction ${hash} failed`);
      }
      return result;
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise<void>((r) => setTimeout(r, POLL_DELAY_MS));
    }
  }
  throw new Error(`ContractError: transaction ${hash} was not confirmed`);
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
