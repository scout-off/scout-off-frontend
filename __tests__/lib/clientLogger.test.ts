import { logger } from '@/lib/clientLogger';

describe('clientLogger', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const parse = (spy: jest.SpyInstance) =>
    JSON.parse(spy.mock.calls[0][0] as string);

  it('routes info to console.log', () => {
    logger.info('hello');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('routes warn to console.warn', () => {
    logger.warn('careful');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('routes error to console.error', () => {
    logger.error('boom');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('emits valid JSON with an ISO timestamp, level and message', () => {
    logger.info('hello');
    const line = parse(logSpy);
    expect(line.level).toBe('info');
    expect(line.message).toBe('hello');
    expect(new Date(line.timestamp).toISOString()).toBe(line.timestamp);
  });

  it('includes caller fields in the output', () => {
    logger.warn('ctx', { userId: 'u1', count: 3 });
    expect(parse(warnSpy)).toMatchObject({ userId: 'u1', count: 3 });
  });

  it('does not let caller fields override level, message or timestamp', () => {
    logger.error('real', {
      level: 'info',
      message: 'fake',
      timestamp: 'not-a-date',
    });
    const line = parse(errorSpy);
    expect(line.level).toBe('error');
    expect(line.message).toBe('real');
    expect(line.timestamp).not.toBe('not-a-date');
    expect(new Date(line.timestamp).toISOString()).toBe(line.timestamp);
  });
});
