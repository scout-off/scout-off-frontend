import { ApiErrorCode, parseApiError } from '@/lib/apiErrorCodes';

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

  it('returns params as undefined when absent', () => {
    expect(
      parseApiError({ error: { code: 'NOT_FOUND', message: 'x' } }),
    ).toEqual({ code: 'NOT_FOUND', params: undefined });
  });

  it('passes an unknown string code through for the caller to fall back on', () => {
    expect(
      parseApiError({ error: { code: 'NOT_A_CODE', message: 'x' } }),
    ).toEqual({
      code: 'NOT_A_CODE',
      params: undefined,
    });
  });

  it('returns null for a legacy { error: string } body', () => {
    expect(parseApiError({ error: 'Unauthorized' })).toBeNull();
  });

  it('returns null when code is not a string', () => {
    expect(parseApiError({ error: { code: 42, message: 'x' } })).toBeNull();
  });

  it('returns null when the error object has no code', () => {
    expect(parseApiError({ error: { message: 'x' } })).toBeNull();
  });

  it.each([null, undefined, 'oops', 123, [], [1, 2], {}, { error: null }])(
    'returns null without throwing for %p',
    (body) => {
      expect(() => parseApiError(body)).not.toThrow();
      expect(parseApiError(body)).toBeNull();
    },
  );
});

describe('ApiErrorCode', () => {
  it('has unique string values', () => {
    const values = Object.values(ApiErrorCode);
    values.forEach((v) => expect(typeof v).toBe('string'));
    expect(new Set(values).size).toBe(values.length);
  });
});
