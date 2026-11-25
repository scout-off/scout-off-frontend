import {
  TransactionFailedError,
  TransactionTimeoutError,
  classifySorobanError,
  extractTxHash,
  runSorobanTx,
} from '@/lib/sorobanTx';

const HASH = 'a'.repeat(64);

describe('extractTxHash', () => {
  it('returns a bare string hash', () => {
    expect(extractTxHash(HASH)).toBe(HASH);
  });

  it('returns the hash from an object with a hash field', () => {
    expect(extractTxHash({ hash: HASH, status: 'SUCCESS' })).toBe(HASH);
  });

  it.each([
    ['empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
    ['object without hash', { txHash: HASH }],
    ['non-string hash', { hash: 123 }],
  ])('returns null for %s', (_label, value) => {
    expect(extractTxHash(value)).toBeNull();
  });
});

describe('classifySorobanError', () => {
  it('flags TransactionFailedError as an on-chain failure', () => {
    const result = classifySorobanError(new TransactionFailedError(HASH));
    expect(result).toMatchObject({
      onChainFailure: true,
      timeout: false,
      i18nKey: null,
      hash: null,
    });
    expect(result.message).toContain(HASH);
  });

  it('flags TransactionTimeoutError as a timeout', () => {
    const result = classifySorobanError(new TransactionTimeoutError(HASH, 5));
    expect(result).toMatchObject({ onChainFailure: false, timeout: true });
  });

  it('propagates the hash when the error carries one', () => {
    const failed = Object.assign(new TransactionFailedError(HASH), {
      hash: HASH,
    });
    const timedOut = Object.assign(new TransactionTimeoutError(HASH, 3), {
      hash: HASH,
    });
    expect(classifySorobanError(failed).hash).toBe(HASH);
    expect(classifySorobanError(timedOut).hash).toBe(HASH);
  });

  it('maps contract error text to an i18n key', () => {
    const result = classifySorobanError(
      new Error('HostError: Error(Contract, #1)'),
    );
    expect(result.i18nKey).not.toBeNull();
    expect(result).toMatchObject({ onChainFailure: false, timeout: false });
  });

  it('keeps the message of a plain Error', () => {
    const result = classifySorobanError(new Error('user rejected'));
    expect(result).toMatchObject({
      message: 'user rejected',
      i18nKey: null,
      hash: null,
    });
  });

  it.each([
    ['string', 'something broke', 'something broke'],
    ['undefined', undefined, 'Transaction failed'],
    ['null', null, 'Transaction failed'],
    ['object', { foo: 'bar' }, '[object Object]'],
  ])('handles a %s without throwing', (_label, value, message) => {
    const result = classifySorobanError(value);
    expect(result).toEqual({
      message,
      i18nKey: null,
      onChainFailure: false,
      timeout: false,
      hash: null,
    });
  });
});

describe('runSorobanTx', () => {
  it('returns success with the hash', async () => {
    const onError = jest.fn();
    await expect(
      runSorobanTx(() => Promise.resolve({ hash: HASH }), { onError }),
    ).resolves.toEqual({ success: true, hash: HASH, error: null });
    expect(onError).not.toHaveBeenCalled();
  });

  it('treats a missing hash as an error', async () => {
    const onError = jest.fn();
    const result = await runSorobanTx(() => Promise.resolve({}), { onError });
    expect(result).toEqual({
      success: false,
      hash: null,
      error: 'Transaction completed but no hash was returned.',
    });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ hash: null, timeout: false }),
    );
  });

  it('passes the classified error to onError and never rejects', async () => {
    const onError = jest.fn();
    const result = await runSorobanTx(
      () => Promise.reject(new TransactionTimeoutError(HASH, 2)),
      { onError },
    );
    expect(result.success).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: true, onChainFailure: false }),
    );
  });

  it('works without options', async () => {
    const result = await runSorobanTx(() => Promise.reject('nope'));
    expect(result).toEqual({ success: false, hash: null, error: 'nope' });
  });
});
