import { getErrorMessage } from '@/lib/getErrorMessage';

describe('getErrorMessage', () => {
  it('returns an Error message', () => {
    expect(getErrorMessage(new Error('request failed'))).toBe('request failed');
  });

  it('returns a thrown string', () => {
    expect(getErrorMessage('request failed')).toBe('request failed');
  });

  it('extracts Axios response error text', () => {
    expect(
      getErrorMessage({ response: { data: { error: 'upstream failed' } } }),
    ).toBe('upstream failed');
  });

  it('extracts an object message', () => {
    expect(getErrorMessage({ message: 'request failed' })).toBe(
      'request failed',
    );
  });

  it('uses a non-empty fallback for other values', () => {
    expect(getErrorMessage({ code: 'unexpected' }, 'Request failed')).toBe(
      'Request failed',
    );
    expect(getErrorMessage({ message: '  ' }, 'Request failed')).toBe(
      'Request failed',
    );
    expect(getErrorMessage({ message: '  ' }, '  ')).toBe(
      'An unexpected error occurred.',
    );
  });
});
