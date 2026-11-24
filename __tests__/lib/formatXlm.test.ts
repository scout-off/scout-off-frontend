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

  describe('rounding boundary values', () => {
    // These sit exactly on a two-decimal rounding boundary. Plain
    // Number.prototype.toFixed rounds them the wrong way because of how the
    // value is stored as binary floating point (e.g. (1.005).toFixed(2) is
    // '1.00', not '1.01').
    it('rounds .xx5 boundaries up like a human would expect', () => {
      expect(formatXlm(1.005)).toBe('1.01');
      expect(formatXlm(2.675)).toBe('2.68');
      expect(formatXlm(0.615)).toBe('0.62');
    });

    it('rounds negative .xx5 boundaries away from zero', () => {
      expect(formatXlm(-1.005)).toBe('-1.01');
      expect(formatXlm(-2.675)).toBe('-2.68');
    });

    it('rounds boundary values passed as strings', () => {
      expect(formatXlm('1.005')).toBe('1.01');
      expect(formatXlm('0.615')).toBe('0.62');
    });
  });

  it('leaves non-boundary values unchanged', () => {
    expect(formatXlm(1.5)).toBe('1.50');
    expect(formatXlm(-1.5)).toBe('-1.50');
  });

  it('falls back to zero for non-finite input', () => {
    expect(formatXlm(Infinity)).toBe('0.00');
    expect(formatXlm(-Infinity)).toBe('0.00');
  });
});
