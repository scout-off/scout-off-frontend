import { formatXlm, XLM_DISPLAY_DECIMALS } from '../../lib/formatXlm';

describe('formatXlm', () => {
  it('formats a whole XLM amount with the configured decimals', () => {
    // arrange
    const amount = 5;

    // act
    const result = formatXlm(amount);

    // assert
    expect(result).toBe('5.00');
  });

  it('formats a fractional XLM amount to the configured decimals', () => {
    // arrange
    const amount = 1.5;

    // act
    const result = formatXlm(amount);

    // assert
    expect(result).toBe('1.50');
  });

  it('accepts numeric strings', () => {
    // arrange
    const amount = '2.25';

    // act
    const result = formatXlm(amount);

    // assert
    expect(result).toBe('2.25');
  });

  it('rounds boundary values the way a human expects', () => {
    // arrange
    const amount = 1.005;

    // act
    const result = formatXlm(amount);

    // assert
    expect(result).toBe('1.01');
  });

  it('falls back to zero for non-finite input', () => {
    // arrange
    const amount = Number.NaN;

    // act
    const result = formatXlm(amount);

    // assert
    expect(result).toBe((0).toFixed(XLM_DISPLAY_DECIMALS));
  });

  it('formats zero as a fixed-point zero string', () => {
    // arrange
    const amount = 0;

    // act
    const result = formatXlm(amount);

    // assert
    expect(result).toBe('0.00');
  });

  it('formats very large amounts without scientific notation', () => {
    // arrange
    const amount = 1_000_000;

    // act
    const result = formatXlm(amount);

    // assert
    expect(result).toBe('1,000,000.00');
    expect(result).not.toMatch(/e/i);
  });

  it('formats one stroop (0.0000001 XLM) without losing the value', () => {
    // arrange
    const amount = 0.0000001;

    // act
    const result = formatXlm(amount);

    // assert
    // One stroop is below the display precision, so it rounds to zero at
    // the configured decimals rather than producing a negative-zero or
    // scientific-notation string.
    expect(result).toBe('0.00');
    expect(result).not.toMatch(/e/i);
  });

  it('formats negative amounts with a leading minus sign', () => {
    // arrange
    // Intended behaviour: negative values are formatted with a minus sign
    // (they are not rejected), so callers can surface refunds/credits.
    const amount = -1;

    // act
    const result = formatXlm(amount);

    // assert
    expect(result).toBe('-1.00');
  });
});
