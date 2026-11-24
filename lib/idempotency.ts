/**
 * Idempotency-key generation shared by hooks/useSubmissionGuard.ts's
 * consumers (issue #1177). See docs/payment-idempotency.md for the full
 * picture of what this key does and doesn't protect against.
 */
export function createIdempotencyKey(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older browsers,
  // some test runners) — not cryptographically strong, but this key only
  // needs to be practically unique per submission attempt, not secret.
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
