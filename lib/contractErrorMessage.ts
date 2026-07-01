export const CONTRACT_ERROR_KEYS = [
  'AlreadyInitialized',
  'NotInitialized',
  'PlayerNotFound',
  'UnauthorizedValidator',
  'InvalidMilestone',
  'AlreadyAtLevel',
  'InsufficientFee',
  'SubscriptionExpired',
  'ContractPaused',
  'Unauthorized',
  'NoFeesToWithdraw',
  'Overflow',
] as const;

export type ContractErrorKey = (typeof CONTRACT_ERROR_KEYS)[number];

/**
 * Human-readable messages for all 12 contract error codes defined in the README.
 *
 * These are shown directly in the UI (TransactionStatus failure state, Toast
 * error displays). They are intentionally more actionable than generic
 * "something went wrong" copy.
 */
export const CONTRACT_ERROR_MESSAGES: Record<ContractErrorKey, string> = {
  AlreadyInitialized:
    'This player is already registered. You cannot register the same wallet twice.',
  NotInitialized:
    'The contract has not been set up yet. Please contact support.',
  PlayerNotFound: 'Player not found. Please check the player ID and try again.',
  UnauthorizedValidator:
    'You are not authorised as a validator. Ask the admin to add your wallet via Add Validator.',
  InvalidMilestone:
    'Milestone data is empty or malformed. Please provide a description and valid evidence.',
  AlreadyAtLevel:
    'This player is already at the required level. No further approval is needed.',
  InsufficientFee:
    'Insufficient XLM fee. Please check the required amount and ensure your wallet has enough funds.',
  SubscriptionExpired:
    'Your scout subscription has expired. Please renew it to continue.',
  ContractPaused:
    'The contract is currently paused by the admin. Please try again later.',
  Unauthorized:
    'You are not authorised to perform this action. Make sure you are using the correct wallet.',
  NoFeesToWithdraw:
    'There are no platform fees available to withdraw at this time.',
  Overflow:
    'A fee calculation error occurred (arithmetic overflow). Please use a smaller XLM amount.',
};

/**
 * Returns the matching ContractErrorKey if the message contains a known
 * contract error name or numeric code, otherwise returns null.
 */
export function extractContractErrorKey(
  message: string,
): ContractErrorKey | null {
  // Named match — fastest path
  for (const key of CONTRACT_ERROR_KEYS) {
    if (message.includes(key)) return key;
  }
  // Numeric code match — e.g. "Error(Contract, #7)" or "error code 7"
  const numericMatch = message.match(/[Ee]rror.*?#(\d+)|error\s+code\s+(\d+)/);
  if (numericMatch) {
    const code = parseInt(numericMatch[1] ?? numericMatch[2], 10);
    // Codes are 1-indexed and map directly to the keys array (code 1 → index 0)
    const key = CONTRACT_ERROR_KEYS[code - 1];
    if (key) return key;
  }
  return null;
}

/**
 * Converts any thrown value from a contract call into a user-readable string.
 *
 * Resolution order:
 * 1. Known contract error key (name or numeric code in the message) → mapped message
 * 2. ContractPausedError class → ContractPaused message
 * 3. Raw JSON in the message → stripped and replaced with a generic prompt
 * 4. Plain error message → returned as-is
 * 5. Unknown → fallback string with numeric code hint when detectable
 *
 * This function never throws.
 */
export function parseContractError(err: unknown): string {
  const raw: string =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : String(err);

  // 1. Named or numeric code match
  const key = extractContractErrorKey(raw);
  if (key) return CONTRACT_ERROR_MESSAGES[key];

  // 2. ContractPausedError by class name (thrown before RPC in buildTx)
  if (err instanceof Error && err.name === 'ContractPausedError') {
    return CONTRACT_ERROR_MESSAGES.ContractPaused;
  }

  // 3. Strip raw JSON blobs so they never reach the UI
  const hasJson = raw.includes('{') || raw.includes('[');
  if (hasJson) {
    // Try to extract a numeric code buried in the JSON
    const buried = raw.match(/"code"\s*:\s*(\d+)/);
    if (buried) {
      const key2 = CONTRACT_ERROR_KEYS[parseInt(buried[1], 10) - 1];
      if (key2) return CONTRACT_ERROR_MESSAGES[key2];
      return `Transaction failed (error code ${buried[1]}). Please try again or contact support.`;
    }
    return 'Transaction failed. Please try again or contact support.';
  }

  // 4. Short, already-readable messages (e.g. "Wallet not connected")
  if (raw && raw.length < 120) return raw;

  // 5. Long unrecognised message — truncate for safety
  return 'Transaction failed. Please try again or contact support.';
}
