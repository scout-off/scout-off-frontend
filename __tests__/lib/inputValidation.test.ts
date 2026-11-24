import {
  TEXT_FIELD_LIMITS,
  sanitizeTextInput,
  validateTextField,
} from '@/lib/inputValidation';

describe('sanitizeTextInput', () => {
  it('trims leading and trailing whitespace', () => {
    expect(sanitizeTextInput('  hello world  ')).toBe('hello world');
  });

  it('keeps newlines and tabs', () => {
    expect(sanitizeTextInput('line one\nline two\tend')).toBe(
      'line one\nline two\tend',
    );
  });

  it('strips C0 control characters', () => {
    const withControlChars = `hello${String.fromCodePoint(1)}${String.fromCodePoint(7)}world`;
    expect(sanitizeTextInput(withControlChars)).toBe('helloworld');
  });

  it('strips the DEL character', () => {
    const withDel = `hello${String.fromCodePoint(127)}world`;
    expect(sanitizeTextInput(withDel)).toBe('helloworld');
  });

  it('leaves ordinary printable text untouched', () => {
    expect(sanitizeTextInput('Just a normal sentence.')).toBe(
      'Just a normal sentence.',
    );
  });

  it('returns an empty string for input that is only control characters/whitespace', () => {
    expect(
      sanitizeTextInput(
        `   ${String.fromCodePoint(1)}${String.fromCodePoint(2)}   `,
      ),
    ).toBe('');
  });
});

describe('validateTextField', () => {
  it('accepts a bio at the minimum boundary (0 chars)', () => {
    expect(validateTextField('bio', '')).toEqual({ valid: true });
  });

  it('accepts a bio at the maximum boundary (500 chars)', () => {
    const value = 'a'.repeat(TEXT_FIELD_LIMITS.bio.max);
    expect(validateTextField('bio', value)).toEqual({ valid: true });
  });

  it('rejects a bio over the maximum length', () => {
    const value = 'a'.repeat(TEXT_FIELD_LIMITS.bio.max + 1);
    const result = validateTextField('bio', value);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Must be at most 500 characters.');
  });

  it('rejects a dispute reason shorter than the minimum', () => {
    const result = validateTextField('disputeReason', 'too short');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Must be at least 10 characters.');
  });

  it('accepts a dispute reason at the minimum boundary', () => {
    const value = 'a'.repeat(TEXT_FIELD_LIMITS.disputeReason.min);
    expect(validateTextField('disputeReason', value)).toEqual({
      valid: true,
    });
  });

  it('rejects a dispute reason over the maximum length', () => {
    const value = 'a'.repeat(TEXT_FIELD_LIMITS.disputeReason.max + 1);
    const result = validateTextField('disputeReason', value);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Must be at most 2000 characters.');
  });

  it('rejects an empty chat message (min 1)', () => {
    const result = validateTextField('chatMessage', '');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Must be at least 1 characters.');
  });

  it('accepts a normal chat message', () => {
    expect(
      validateTextField('chatMessage', 'hey, is this player free?'),
    ).toEqual({ valid: true });
  });

  it('sanitizes before checking length, so control-char-only input is treated as empty', () => {
    const controlOnly = String.fromCodePoint(1) + String.fromCodePoint(2);
    const result = validateTextField('chatMessage', controlOnly);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Must be at least 1 characters.');
  });

  it('sanitizes before checking max length, so control chars do not count toward the limit', () => {
    // At the max once control chars are stripped, even though the raw
    // string (with control chars mixed in) is longer than the limit.
    const raw =
      'a'.repeat(TEXT_FIELD_LIMITS.chatMessage.max) + String.fromCodePoint(1);
    const result = validateTextField('chatMessage', raw);
    expect(result.valid).toBe(true);
  });
});
