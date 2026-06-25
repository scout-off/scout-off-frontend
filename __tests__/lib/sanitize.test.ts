import { sanitize } from '@/lib/sanitize';

describe('sanitize', () => {
  it('removes HTML tags', () => {
    expect(sanitize('<b>Hello</b>')).toBe('Hello');
    expect(sanitize('<script>alert(1)</script>foo')).toBe('foo');
    expect(sanitize('<div onclick="x">hi</div>')).toBe('hi');
  });

  it('preserves plain text', () => {
    expect(sanitize('plain text')).toBe('plain text');
  });

  it('returns empty string for falsy input', () => {
    expect(sanitize('')).toBe('');
  });
});
