/**
 * Minimal, dependency-free Soroban JSON-RPC client for broadcasting an
 * already-signed transaction envelope.
 *
 * Deliberately does not use @stellar/stellar-sdk: this module is shared by
 * the main thread *and* the background-sync service worker (worker/index.js
 * imports it directly), and pulling the full SDK into a service worker
 * bundle is unnecessary weight for a single JSON-RPC call this simple —
 * `sendTransaction` just POSTs `{ transaction: <base64 XDR> }` and reads
 * back `{ status, hash }`. Signing (which does need the SDK / wallet
 * extension) has already happened by the time anything here runs.
 */

const DEFAULT_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC || DEFAULT_SOROBAN_RPC_URL;

export interface SorobanSendTransactionResult {
  status: string;
  hash: string;
  errorResultXdr?: string;
}

/**
 * `kind: 'network'` means the failure is plausibly transient (connectivity
 * dropped, the RPC node timed out, etc.) — worth queuing for retry.
 * `kind: 'rejected'` means the RPC node processed the request and the
 * network rejected the transaction itself — retrying the same signed XDR
 * will never succeed.
 */
export class SorobanRpcError extends Error {
  readonly kind: 'network' | 'rejected';

  constructor(message: string, kind: 'network' | 'rejected') {
    super(message);
    this.name = 'SorobanRpcError';
    this.kind = kind;
  }
}

let rpcRequestId = 0;

/**
 * POSTs an already wallet-signed, base64-encoded transaction envelope XDR
 * to the Soroban RPC `sendTransaction` method and returns the raw
 * acceptance result. Does not poll for on-chain confirmation — callers that
 * need that should use lib/stellar.ts's `pollTransaction` separately.
 */
export async function submitSignedTransaction(
  signedXdr: string,
): Promise<SorobanSendTransactionResult> {
  let res: Response;
  try {
    res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++rpcRequestId,
        method: 'sendTransaction',
        params: { transaction: signedXdr },
      }),
    });
  } catch {
    // fetch() rejects (TypeError) on DNS failure / offline / CORS-blocked —
    // exactly the "no network" case this whole feature exists to recover from.
    throw new SorobanRpcError(
      'Network error while submitting transaction',
      'network',
    );
  }

  if (!res.ok) {
    // A non-2xx from the RPC node itself (5xx, rate limit, etc.) is treated
    // as transient rather than a rejection of the transaction.
    throw new SorobanRpcError(
      `Soroban RPC returned HTTP ${res.status}`,
      'network',
    );
  }

  let body: {
    result?: SorobanSendTransactionResult;
    error?: { message?: string };
  };
  try {
    body = await res.json();
  } catch {
    throw new SorobanRpcError(
      'Soroban RPC returned a malformed response',
      'network',
    );
  }

  if (body.error) {
    throw new SorobanRpcError(
      body.error.message ?? 'Soroban RPC returned an error',
      'network',
    );
  }
  if (!body.result) {
    throw new SorobanRpcError(
      'Soroban RPC returned an empty result',
      'network',
    );
  }
  if (body.result.status === 'ERROR') {
    throw new SorobanRpcError(
      `Transaction rejected by the network: ${body.result.errorResultXdr ?? 'unknown error'}`,
      'rejected',
    );
  }

  return body.result;
}

/** True for a failure worth queuing for background-sync retry. */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof SorobanRpcError) return err.kind === 'network';
  // Defensive fallback for a raw fetch failure that somehow escapes
  // submitSignedTransaction's own try/catch (e.g. a caller using fetch directly).
  return typeof TypeError !== 'undefined' && err instanceof TypeError;
}
