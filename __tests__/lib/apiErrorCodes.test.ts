import { ApiErrorCode, parseApiError } from '@/lib/apiErrorCodes';

describe('ApiErrorCode', () => {
  it('has unique string values', () => {
    const values = Object.values(ApiErrorCode);
    values.forEach((v) => expect(typeof v).toBe('string'));
    expect(new Set(values).size).toBe(values.length);
  });

  it('includes the UNKNOWN fallback code', () => {
    expect(ApiErrorCode.UNKNOWN).toBe('UNKNOWN');
  });
});

describe('parseApiError', () => {
  it('returns code and params for a well-formed body', () => {
    const body = {
      error: {
        code: ApiErrorCode.FIELD_TOO_LONG,
        params: { field: 'bio', max: 500 },
        message: 'Field too long',
      },
    };
    expect(parseApiError(body)).toEqual({
      code: 'FIELD_TOO_LONG',
      params: { field: 'bio', max: 500 },
    });
  });

  it('returns params as undefined when omitted', () => {
    expect(
      parseApiError({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
    ).toEqual({ code: 'NOT_FOUND', params: undefined });
  });

  it('passes unknown codes through unchanged for the client to fall back on', () => {
    expect(
      parseApiError({ error: { code: 'SOMETHING_NEW', message: 'x' } }),
    ).toEqual({ code: 'SOMETHING_NEW', params: undefined });
  });

  it('returns null for a legacy { error: string } body', () => {
    expect(parseApiError({ error: 'Unauthorized' })).toBeNull();
  });

  it('returns null when the code is not a string', () => {
    expect(parseApiError({ error: { code: 42, message: 'x' } })).toBeNull();
  });

  it('returns null when the error object has no code', () => {
    expect(parseApiError({ error: { message: 'x' } })).toBeNull();
  });

  it('returns null when error is missing', () => {
    expect(parseApiError({})).toBeNull();
  });

  it.each([null, undefined, 'error', 123, [], ['a'], true])(
    'does not throw and returns null for %p',
    (body) => {
      expect(() => parseApiError(body)).not.toThrow();
      expect(parseApiError(body)).toBeNull();
    },
  );
});
