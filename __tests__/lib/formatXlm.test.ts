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
});
