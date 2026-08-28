import type { SubscriptionTier } from '@/types';

/**
 * ============================================================================
 * SINGLE SOURCE OF TRUTH: FEE SCHEDULE & PRICING
 * ============================================================================
 *
 * ARCHITECTURAL CONTEXT & PRICING DRIFT CONSIDERATIONS:
 *
 * 1. Contract Enforcement vs. Event Schema:
 *    In the current Soroban contract implementation, fee amounts for pay-to-contact
 *    and subscription purchases are strictly validated and charged at invocation time.
 *    However, standard indexed contract events (e.g. `scout_subscribed`) historically
 *    recorded the tier name (`basic`, `pro`, `elite`) rather than the raw XLM/stroop
 *    amount transferred on-chain.
 *
 * 2. Dynamic Amount Resolution vs. Approximate Fallback:
 *    To ensure analytics (both scout spending and admin fee revenue) remain accurate
 *    across pricing changes or indexer upgrades:
 *    - If an indexed event payload includes an explicit fee record (`data.fee_xlm`,
 *      `data.amount_xlm`, `data.fee`, or `data.amount`), `resolveSubscriptionFee` and
 *      `resolveContactFee` will prioritize and return that exact charged amount.
 *    - If no explicit fee amount is present in the event data, they fall back to the
 *      canonical schedule defined below (`TIER_FEES_XLM`, `CONTACT_FEE_XLM`).
 *
 * 3. On-Chain Drift Detection:
 *    `useFeeDriftDetection` continuously compares the static constants below against
 *    live contract calls (such as `getContactFee()`), alerting administrators if
 *    the deployed contract's fee parameters diverge from this build-time schedule.
 *
 * When updating pricing in the future:
 * - Update the constants below in this file.
 * - Update contract deployment configuration / parameters accordingly.
 * ============================================================================
 */

/**
 * Canonical XLM fees by subscription tier.
 */
export const TIER_FEES_XLM: Record<SubscriptionTier | string, number> = {
  basic: 5,
  pro: 12,
  elite: 20,
};

/** Default subscription fee in XLM if an unrecognized tier is encountered without explicit amount data. */
export const DEFAULT_SUBSCRIPTION_FEE_XLM = 5;

/** Fixed canonical pay-to-contact fee in XLM. */
export const CONTACT_FEE_XLM = 1;

/**
 * Extracts a numeric fee from an unknown event data field if present.
 */
function extractNumericFee(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * Resolves the actual or approximate XLM fee for a subscription event.
 *
 * Prioritizes actual fee fields present on the indexed event payload (`fee_xlm`, `amount_xlm`, `fee`, `amount`),
 * falling back to the canonical `TIER_FEES_XLM` lookup by tier or `DEFAULT_SUBSCRIPTION_FEE_XLM`.
 *
 * @param eventData - The `data` record from the indexed event
 * @param tier - The subscription tier string
 * @returns The resolved XLM fee amount
 */
export function resolveSubscriptionFee(
  eventData?: Record<string, unknown> | null,
  tier?: string | null,
): number {
  if (eventData) {
    const explicitFee =
      extractNumericFee(eventData.fee_xlm) ??
      extractNumericFee(eventData.amount_xlm) ??
      extractNumericFee(eventData.subscription_fee_xlm) ??
      extractNumericFee(eventData.fee) ??
      extractNumericFee(eventData.amount);

    if (explicitFee !== null) {
      return explicitFee;
    }
  }

  const resolvedTier = tier ?? (typeof eventData?.tier === 'string' ? eventData.tier : 'basic');
  return TIER_FEES_XLM[resolvedTier] ?? DEFAULT_SUBSCRIPTION_FEE_XLM;
}

/**
 * Resolves the actual or approximate XLM fee for a pay-to-contact event.
 *
 * Prioritizes actual fee fields present on the indexed event payload (`fee_xlm`, `amount_xlm`, `fee`, `amount`),
 * falling back to the canonical `CONTACT_FEE_XLM`.
 *
 * @param eventData - The `data` record from the indexed event
 * @returns The resolved XLM fee amount
 */
export function resolveContactFee(
  eventData?: Record<string, unknown> | null,
): number {
  if (eventData) {
    const explicitFee =
      extractNumericFee(eventData.fee_xlm) ??
      extractNumericFee(eventData.amount_xlm) ??
      extractNumericFee(eventData.contact_fee_xlm) ??
      extractNumericFee(eventData.fee) ??
      extractNumericFee(eventData.amount);

    if (explicitFee !== null) {
      return explicitFee;
    }
  }

  return CONTACT_FEE_XLM;
}
