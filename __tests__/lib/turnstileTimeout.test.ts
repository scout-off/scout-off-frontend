/**
 * @jest-environment node
 */
import { TURNSTILE_TIMEOUT_MS, verifyTurnstileToken } from '@/lib/turnstile';

const SECRET = 'test-secret';
const TOKEN = 'test-token';

let fetchMock: jest.Mock;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  process.env.TURNSTILE_SECRET_KEY = SECRET;
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
  warnSpy.mockRestore();
  jest.useRealTimers();
});

function loggedText(): string {
  return JSON.stringify(warnSpy.mock.calls);
}

describe('verifyTurnstileToken', () => {
  it('returns true on a successful verification', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    await expect(verifyTurnstileToken(TOKEN)).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('returns false after the timeout when fetch hangs', async () => {
    jest.useFakeTimers();
    // AbortSignal.timeout uses Node's internal timers, which fake timers
    // don't control — back it with a (faked) setTimeout instead.
    const timeoutSpy = jest
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
      });
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const result = verifyTurnstileToken(TOKEN);
    await jest.advanceTimersByTimeAsync(TURNSTILE_TIMEOUT_MS);
    await expect(result).resolves.toBe(false);
    expect(timeoutSpy).toHaveBeenCalledWith(TURNSTILE_TIMEOUT_MS);
    timeoutSpy.mockRestore();
  });

  it('returns false on non-2xx without parsing JSON', async () => {
    const json = jest.fn();
    fetchMock.mockResolvedValue({ ok: false, status: 503, json });
    await expect(verifyTurnstileToken(TOKEN)).resolves.toBe(false);
    expect(json).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('turnstile verify non-2xx', {
      status: 503,
    });
  });

  it('logs error-codes at warn level without the token or secret', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
    });
    await expect(verifyTurnstileToken(TOKEN)).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalledWith('turnstile rejected', {
      codes: ['invalid-input-response'],
    });
    expect(loggedText()).not.toContain(TOKEN);
    expect(loggedText()).not.toContain(SECRET);
  });
});
