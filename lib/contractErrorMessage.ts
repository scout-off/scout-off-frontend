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
 * Returns the matching ContractErrorKey if the message contains a known
 * contract error code, otherwise returns null.
 */
export function extractContractErrorKey(message: string): ContractErrorKey | null {
  for (const key of CONTRACT_ERROR_KEYS) {
    if (message.includes(key)) return key;
  }
  return null;
}
