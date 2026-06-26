import { sanitize } from '@/lib/sanitize';

describe('sanitize', () => {
  it('strips <script> tags', () => {
    expect(sanitize('<script>alert(1)</script>foo')).toBe('foo');
    expect(sanitize('<script src="evil.js"></script>safe')).toBe('safe');
  });

  it('strips event handler attributes', () => {
    expect(sanitize('<div onerror="bad()">content</div>')).toBe('content');
    expect(sanitize('<img onload="steal()" src="x">')).toBe('');
    expect(sanitize('<div onclick="x">hi</div>')).toBe('hi');
  });

  it('removes all HTML tags from input', () => {
    expect(sanitize('<b>Hello</b>')).toBe('Hello');
    expect(sanitize('<div onclick="x">hi</div>')).toBe('hi');
  });

  it('preserves plain text', () => {
    expect(sanitize('plain text')).toBe('plain text');
  });

  it('returns empty string for empty input', () => {
    expect(sanitize('')).toBe('');
  });

  it('returns empty string for null-like input', () => {
    expect(sanitize(null as unknown as string)).toBe('');
  });

  it('does not mutate the original input string', () => {
    const input = '<b>bold</b>';
    const copy = input;
    sanitize(input);
    expect(input).toBe(copy);
  });
});
