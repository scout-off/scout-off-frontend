import { rpc } from './stellar';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;

export interface WaitForInclusionOptions {
  /**
   * Maximum total time to wait for inclusion. Defaults to 30s — Stellar's
   * typical close time is 3–5s, so 30s is a generous upper bound that still
   * surfaces a stuck ledger before users assume the app is hung.
   */
  timeoutMs?: number;
  /** How often to query `rpc.getTransaction` between polls. Defaults to 1.5s. */
  pollIntervalMs?: number;
  /**
   * Cancellation handle. Aborting throws a DOMException with name 'AbortError',
   * which callers must recognise and rethrow-never-render (avoids React
   * warnings about state updates on an unmounted component).
   */
  signal?: AbortSignal;
}

/**
 * Poll the configured Soroban RPC until the given transaction hash is included
 * in a closed ledger (`status === 'SUCCESS'`).
 *
 * Why this exists: `rpc.sendTransaction` resolves as soon as the network *accepts*
 * a transaction. But contract state — and therefore subsequent `simulate`/`getXxx`
 * reads — only updates once the transaction lives in a closed ledger. On Stellar
 * that's typically 3–5 seconds. Without this helper, a registration flow can
 * trigger a follow-up read in the gap between accept and inclusion and see stale
 * state — e.g. "is the player registered yet" returning `false` 3-5s after the
 * tx was definitely accepted.
 *
 * @param hash     Transaction hash returned by `rpc.sendTransaction`.
 * @param options  Polling interval, timeout, and cancellation signal.
 *
 * @throws {Error}           'FAILED' status returned by `rpc.getTransaction`.
 * @throws {Error}           Timed out before inclusion.
 * @throws {DOMException}    `signal` was aborted (treated as a silent cancel).
 */
export async function waitForInclusion(
  hash: string,
  options: WaitForInclusionOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const signal = options.signal;

  const start = Date.now();
  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) {
      throw new Error(
        `Timed out (${elapsed}ms) waiting for Soroban tx ${hash} to be included in a closed ledger`,
      );
    }

    const response = await rpc.getTransaction(hash);
    switch (response.status) {
      case 'SUCCESS':
        return;
      case 'FAILED':
        throw new Error(
          `Soroban tx ${hash} reported FAILED on-ledger: ${JSON.stringify(response)}`,
        );
      case 'NOT_FOUND':
      default:
        // Soroban returns NOT_FOUND while the tx is still propagating / pending
        // inclusion in a closed ledger. Keep polling until it lands or times out.
    }

    await sleep(pollIntervalMs, signal);
  }
}

/** `setTimeout` that rejects with `AbortError` if `signal` aborts before then. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
