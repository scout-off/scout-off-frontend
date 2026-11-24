import {
  ValidationError,
  ContractPausedError,
  ContractIncompatibleError,
} from '@/lib/errors';

describe('ValidationError', () => {
  it('is an instanceof ValidationError and Error', () => {
    const err = new ValidationError('invalid scoutKey address');
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toBeInstanceOf(Error);
  });

  it('sets name to "ValidationError"', () => {
    const err = new ValidationError('invalid scoutKey address');
    expect(err.name).toBe('ValidationError');
  });

  it('reflects the constructor message', () => {
    const err = new ValidationError('invalid scoutKey address');
    expect(err.message).toBe('invalid scoutKey address');
  });

  it('is not an instanceof the other two error classes', () => {
    const err = new ValidationError('invalid scoutKey address');
    expect(err).not.toBeInstanceOf(ContractPausedError);
    expect(err).not.toBeInstanceOf(ContractIncompatibleError);
  });
});

describe('ContractPausedError', () => {
  it('is an instanceof ContractPausedError and Error', () => {
    const err = new ContractPausedError();
    expect(err).toBeInstanceOf(ContractPausedError);
    expect(err).toBeInstanceOf(Error);
  });

  it('sets name to "ContractPausedError"', () => {
    const err = new ContractPausedError();
    expect(err.name).toBe('ContractPausedError');
  });

  it('has the fixed message "ContractPaused"', () => {
    const err = new ContractPausedError();
    expect(err.message).toBe('ContractPaused');
  });

  it('is not an instanceof the other two error classes', () => {
    const err = new ContractPausedError();
    expect(err).not.toBeInstanceOf(ValidationError);
    expect(err).not.toBeInstanceOf(ContractIncompatibleError);
  });
});

describe('ContractIncompatibleError', () => {
  it('is an instanceof ContractIncompatibleError and Error', () => {
    const err = new ContractIncompatibleError('contract version mismatch');
    expect(err).toBeInstanceOf(ContractIncompatibleError);
    expect(err).toBeInstanceOf(Error);
  });

  it('sets name to "ContractIncompatibleError"', () => {
    const err = new ContractIncompatibleError('contract version mismatch');
    expect(err.name).toBe('ContractIncompatibleError');
  });

  it('reflects the constructor message', () => {
    const err = new ContractIncompatibleError('contract version mismatch');
    expect(err.message).toBe('contract version mismatch');
  });

  it('is not an instanceof the other two error classes', () => {
    const err = new ContractIncompatibleError('contract version mismatch');
    expect(err).not.toBeInstanceOf(ValidationError);
    expect(err).not.toBeInstanceOf(ContractPausedError);
  });
});
