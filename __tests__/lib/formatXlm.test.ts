import { formatXlm, XLM_DISPLAY_DECIMALS } from '@/lib/formatXlm';

describe('formatXlm', () => {
  it('formats whole numbers with the standard decimal precision', () => {
    expect(formatXlm(1)).toBe('1.00');
    expect(formatXlm(12)).toBe('12.00');
  });

  it('rounds long trailing decimals to the configured precision', () => {
    expect(formatXlm(4.999999)).toBe('5.00');
    expect(formatXlm(1.006)).toBe('1.01');
    expect(formatXlm(0.123456789)).toBe('0.12');
  });

  it('accepts numeric strings', () => {
    expect(formatXlm('5')).toBe('5.00');
    expect(formatXlm('7.5')).toBe('7.50');
  });

  it('falls back to zero for non-finite or unparsable input', () => {
    expect(formatXlm(NaN)).toBe('0.00');
    expect(formatXlm('not-a-number')).toBe('0.00');
  });

  it('handles zero', () => {
    expect(formatXlm(0)).toBe('0.00');
  });

  it('uses the exported precision constant', () => {
    expect(XLM_DISPLAY_DECIMALS).toBe(2);
    expect(formatXlm(3.14159).split('.')[1]).toHaveLength(XLM_DISPLAY_DECIMALS);
  });

  // arrange / act / assert — edge-case coverage

  it('formats zero as "0.00"', () => {
    // arrange & act
    const result = formatXlm(0);
    // assert
    expect(result).toBe('0.00');
  });

  it('formats very large amounts without scientific notation', () => {
    // arrange & act
    const result = formatXlm(1_000_000);
    // assert
    expect(result).toBe('1000000.00');
    expect(result).not.toContain('e');
  });

  it('formats Stellar stroop-level fractional amounts', () => {
    // arrange & act — 0.0000001 XLM = 1 stroop, rounds to 2 decimals
    const result = formatXlm(0.0000001);
    // assert
    expect(result).toBe('0.00');
  });

  it('formats negative values with a minus sign', () => {
    // arrange & act
    const result = formatXlm(-1);
    // assert
    expect(result).toBe('-1.00');
  });

  it('formats large fractional amounts correctly', () => {
    // arrange & act
    const result = formatXlm(999999.99);
    // assert
    expect(result).toBe('999999.99');
  });

  it('handles Infinity by returning zero', () => {
    // arrange & act
    const result = formatXlm(Infinity);
    // assert
    expect(result).toBe('0.00');
  });
});
