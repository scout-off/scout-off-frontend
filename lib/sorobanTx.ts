/**
 * Typed Soroban transaction lifecycle module (#1476).
 *
 * Problem: Every contract-writing hook and form re-implements the
 * sign → submit → extract hash → map error flow and reaches into untyped
 * results:
 *   hooks/useTrialOffer.ts:67        (result as any)?.hash
 *   hooks/useValidator.ts:112        (result as any)?.hash
 *   components/validator/RevokeForm.tsx:106,113,350,372,379
 *   components/academy/BulkPlayerImport.tsx:365
 *   hooks/usePayToContact.ts
 *
 * Each copy handles pending, timeout and failure states slightly differently,
 * making the codebase fragile and hard to audit.
 *
 * Solution: A single typed module that:
 *   1. Defines `SorobanTxResult` — the canonical success shape every hook
 *      should use instead of `any`.
 *   2. Exports `extractTxHash(result)` — converts either a bare string hash
 *      (from WalletContext.signAndSubmit) or a full SorobanRpc response
 *      (from lib/stellar.ts signAndSubmitTx) into a plain `string | null`.
 *      Eliminates every `(result as any)?.hash` occurrence.
 *   3. Exports `runSorobanTx<T>()` — wraps the sign → submit → extract hash
 *      → map error flow in a single, well-typed helper that hooks can call
 *      instead of duplicating try/catch boilerplate.
 *   4. Re-exports `TransactionFailedError` and `TransactionTimeoutError` so
 *      call-sites that import from here don't need a separate import from
 *      lib/stellar.
 *
 * Usage (replacing the scattered pattern in hooks/useTrialOffer.ts etc.):
 *
 *   import { runSorobanTx } from '@/lib/sorobanTx';
 *
 *   const { hash, error } = await runSorobanTx(() => signAndSubmit(xdr));
 *   if (error) { ... }
 *   setTxHash(hash);
 */

import {
  TransactionFailedError,
  TransactionTimeoutError,
} from '@/lib/stellar';
import { extractContractErrorKey } from '@/lib/contractErrorMessage';

export { TransactionFailedError, TransactionTimeoutError };

// ── Canonical result type ─────────────────────────────────────────────────────

/**
 * The normalised outcome of a Soroban contract write operation.
 *
 * - `success: true`  → `hash` is the confirmed transaction hash; `error` is null.
 * - `success: false` → `error` is a user-facing message; `hash` may still be
 *   set when the chain confirmed the tx but it landed as FAILED, or when a
 *   timeout occurred (hash is known but confirmation is uncertain).
 */
export type SorobanTxResult =
  | { success: true; hash: string; error: null }
  | { success: false; hash: string | null; error: string };

// ── SorobanRpc response duck-type ─────────────────────────────────────────────

/**
 * Minimal interface that covers both:
 *   - The full `SorobanRpc.Api.GetSuccessfulTransactionResponse` returned by
 *     `lib/stellar.ts#signAndSubmitTx` (has a `.hash` field set by the
 *     `pollTransaction` path through `rpc.sendTransaction.hash`).
 *   - Any future response shape that carries a `hash` string property.
 *
 * By duck-typing rather than importing `SorobanRpc` we avoid a hard coupling
 * to `@stellar/stellar-sdk`'s internal API surface in this utility module.
 */
interface HasHash {
  hash: string;
}

function hasHashProp(v: unknown): v is HasHash {
  return (
    typeof v === 'object' &&
    v !== null &&
    'hash' in v &&
    typeof (v as Record<string, unknown>).hash === 'string'
  );
}

// ── extractTxHash ─────────────────────────────────────────────────────────────

/**
 * Extracts a transaction hash from whatever `signAndSubmit`/`signAndSubmitTx`
 * returned.
 *
 * Call-sites that used `(result as any)?.hash ?? null` or
 * `typeof result === 'string' ? result : (result as any)?.hash ?? null`
 * should be replaced with `extractTxHash(result)`.
 *
 * @param result  The value returned by `signAndSubmit` (a bare hash string),
 *                `signAndSubmitTx` (a SorobanRpc response object with a `.hash`
 *                property), or any unknown/untyped intermediate.
 * @returns The hash string, or `null` if it cannot be extracted.
 */
export function extractTxHash(result: unknown): string | null {
  if (typeof result === 'string' && result.length > 0) return result;
  if (hasHashProp(result)) return result.hash;
  return null;
}

// ── Error classification ──────────────────────────────────────────────────────

/**
 * Extracts a stable, user-facing error message from a Soroban transaction
 * error, keeping the per-caller variation in error messages out of hooks.
 *
 * The `i18nKey` field is populated when the error maps to a known contract
 * error code (see lib/contractErrorMessage.ts). Callers that use `next-intl`
 * can pass it directly to `t(key)`.
 */
export interface SorobanTxError {
  message: string;
  /** Populated when the error maps to a known contract-error i18n key. */
  i18nKey: string | null;
  /** Whether the chain confirmed the tx as FAILED (vs a pre-submission error). */
  onChainFailure: boolean;
  /** Whether the error is a polling timeout (tx may still confirm later). */
  timeout: boolean;
  /**
   * The transaction hash, present when the tx reached the chain but failed or
   * timed out — useful for linking to a block explorer.
   */
  hash: string | null;
}

/**
 * Classifies a caught error into a structured `SorobanTxError`.
 *
 * Handles:
 *   - `TransactionFailedError` (on-chain FAILED status)
 *   - `TransactionTimeoutError` (polling timed out)
 *   - Contract error strings (extractContractErrorKey)
 *   - Generic Error / unknown values
 */
export function classifySorobanError(err: unknown): SorobanTxError {
  if (err instanceof TransactionFailedError) {
    const hash = extractTxHash(err) ?? null;
    return {
      message: err.message,
      i18nKey: null,
      onChainFailure: true,
      timeout: false,
      hash,
    };
  }

  if (err instanceof TransactionTimeoutError) {
    const hash = extractTxHash(err) ?? null;
    return {
      message: err.message,
      i18nKey: null,
      onChainFailure: false,
      timeout: true,
      hash,
    };
  }

  const rawMessage = err instanceof Error ? err.message : String(err ?? 'Transaction failed');
  const i18nKey = extractContractErrorKey(rawMessage);

  return {
    message: rawMessage,
    i18nKey,
    onChainFailure: false,
    timeout: false,
    hash: null,
  };
}

// ── runSorobanTx ──────────────────────────────────────────────────────────────

/**
 * Options for `runSorobanTx`.
 */
export interface RunSorobanTxOptions {
  /**
   * Called with the error immediately after it is classified, before the
   * function returns.  Use this for side-effects (e.g. showing a toast,
   * logging to Sentry) without duplicating the catch block.
   */
  onError?: (err: SorobanTxError) => void;
}

/**
 * Runs a Soroban contract write operation end-to-end and returns a typed
 * `SorobanTxResult`.
 *
 * This is the primary replacement for the scattered sign → submit → extract
 * hash → map error pattern.  Pass a thunk that calls `signAndSubmit(xdr)` (or
 * any async operation that resolves to a tx hash / SorobanRpc response):
 *
 * ```ts
 * // Before (useTrialOffer.ts):
 * const result = await signAndSubmit(xdr);
 * setTxHash((result as any)?.hash ?? null);
 *
 * // After:
 * const txResult = await runSorobanTx(() => signAndSubmit(xdr));
 * if (txResult.success) setTxHash(txResult.hash);
 * else setError(txResult.error);
 * ```
 *
 * The function never throws — all errors are captured into the returned
 * `SorobanTxResult`.  If you need the raw error (e.g. to re-throw for an
 * outer guard), use `classifySorobanError` directly.
 *
 * @param fn   Async factory that performs the sign+submit work and resolves
 *             with a raw result (string hash or SorobanRpc response object).
 * @param opts Optional callbacks.
 * @returns    A `SorobanTxResult` — never rejects.
 */
export async function runSorobanTx(
  fn: () => Promise<unknown>,
  opts: RunSorobanTxOptions = {},
): Promise<SorobanTxResult> {
  try {
    const raw = await fn();
    const hash = extractTxHash(raw);
    if (!hash) {
      // fn resolved but we couldn't extract a hash — treat as an error so
      // callers don't silently end up with a null hash in a "success" state.
      const txError: SorobanTxError = {
        message: 'Transaction completed but no hash was returned.',
        i18nKey: null,
        onChainFailure: false,
        timeout: false,
        hash: null,
      };
      opts.onError?.(txError);
      return { success: false, hash: null, error: txError.message };
    }
    return { success: true, hash, error: null };
  } catch (err) {
    const txError = classifySorobanError(err);
    opts.onError?.(txError);
    return { success: false, hash: txError.hash, error: txError.message };
  }
}
