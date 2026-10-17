import {
  verifyTurnstileToken,
  _resetTurnstileWarningForTests,
} from '@/lib/turnstile';

describe('verifyTurnstileToken production warning', () => {
  const env = process.env as Record<string, string | undefined>;
  const original = { ...env };

  beforeEach(() => {
    delete env.TURNSTILE_SECRET_KEY;
    _resetTurnstileWarningForTests();
  });
  afterEach(() => {
    env.NODE_ENV = original.NODE_ENV;
    jest.restoreAllMocks();
  });

  it('logs exactly one error in production when the secret is unset', async () => {
    env.NODE_ENV = 'production';
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await verifyTurnstileToken('x')).toBe(true);
    expect(await verifyTurnstileToken('y')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('[turnstile]');
  });

  it('does not log outside production', async () => {
    env.NODE_ENV = 'test';
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await verifyTurnstileToken('x')).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
