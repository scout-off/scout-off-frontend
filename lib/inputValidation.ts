/**
 * Validation for off-chain, user-authored text fields (profile bio, dispute
 * reason, chat messages) that are not otherwise constrained before submission.
 *
 * Not yet wired into any form - provides shared limits + a validator so each
 * field can adopt it without duplicating ad-hoc length checks.
 */

export const TEXT_FIELD_LIMITS = {
  bio: { min: 0, max: 500 },
  disputeReason: { min: 10, max: 2000 },
  chatMessage: { min: 1, max: 1000 },
} as const;

export type TextFieldKey = keyof typeof TEXT_FIELD_LIMITS;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Drops control characters (keeping newline/tab) before length checks.
function isDisallowedControlChar(codePoint: number): boolean {
  const isNewlineOrTab =
    codePoint === 9 || codePoint === 10 || codePoint === 13;
  const isC0Control = codePoint < 32;
  const isDelete = codePoint === 127;
  return !isNewlineOrTab && (isC0Control || isDelete);
}

export function sanitizeTextInput(value: string): string {
  let result = '';
  for (const char of value) {
    if (!isDisallowedControlChar(char.codePointAt(0) ?? 0)) {
      result += char;
    }
  }
  return result.trim();
}

export function validateTextField(
  field: TextFieldKey,
  value: string,
): ValidationResult {
  const { min, max } = TEXT_FIELD_LIMITS[field];
  const sanitized = sanitizeTextInput(value);

  if (sanitized.length < min) {
    return { valid: false, error: `Must be at least ${min} characters.` };
  }
  if (sanitized.length > max) {
    return { valid: false, error: `Must be at most ${max} characters.` };
  }
  return { valid: true };
}
