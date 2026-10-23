/** @jest-environment node */
import { verifyTurnstileToken } from '@/lib/turnstile';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

describe('verifyTurnstileToken', () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.Mock;
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalSecret = process.env.TURNSTILE_SECRET_KEY;
    fetchMock = jest.fn();
    // @ts-expect-error — inject a mock into the global fetch in the node env
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalSecret === undefined) {
      delete process.env.TURNSTILE_SECRET_KEY;
    } else {
      process.env.TURNSTILE_SECRET_KEY = originalSecret;
    }
    fetchMock.mockReset();
  });

  describe('when TURNSTILE_SECRET_KEY is unset', () => {
    beforeEach(() => {
      delete process.env.TURNSTILE_SECRET_KEY;
    });

    it('skips verification and returns true', async () => {
      await expect(verifyTurnstileToken('any-token')).resolves.toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns true even for an empty/missing token', async () => {
      await expect(verifyTurnstileToken('')).resolves.toBe(true);
      await expect(verifyTurnstileToken(null)).resolves.toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('when TURNSTILE_SECRET_KEY is set', () => {
    beforeEach(() => {
      process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    });

    it('rejects a missing token (empty string)', async () => {
      await expect(verifyTurnstileToken('')).resolves.toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only token', async () => {
      await expect(verifyTurnstileToken('   ')).resolves.toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a non-string token', async () => {
      await expect(verifyTurnstileToken(null)).resolves.toBe(false);
      await expect(verifyTurnstileToken(undefined)).resolves.toBe(false);
      await expect(verifyTurnstileToken(12345)).resolves.toBe(false);
      await expect(verifyTurnstileToken({ token: 'x' })).resolves.toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('POSTs to the Cloudflare siteverify endpoint with the expected form body', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      await verifyTurnstileToken('good-token', '203.0.113.7');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(VERIFY_URL);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({
        'Content-Type': 'application/x-www-form-urlencoded',
      });
      const body = String(init?.body);
      expect(body).toContain('secret=test-secret');
      expect(body).toContain('response=good-token');
      expect(body).toContain('remoteip=203.0.113.7');
    });

    it('omits remoteip when no IP is supplied', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      await verifyTurnstileToken('good-token');

      const body = String(fetchMock.mock.calls[0][1]?.body);
      expect(body).not.toContain('remoteip=');
    });

    it('omits remoteip when the IP is the literal "unknown"', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      await verifyTurnstileToken('good-token', 'unknown');

      const body = String(fetchMock.mock.calls[0][1]?.body);
      expect(body).not.toContain('remoteip=');
    });

    it('returns true when Cloudflare reports success', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );
      await expect(verifyTurnstileToken('good-token')).resolves.toBe(true);
    });

    it('returns false when Cloudflare reports failure', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: false, 'error-codes': ['bad'] }),
          { status: 200 },
        ),
      );
      await expect(verifyTurnstileToken('bad-token')).resolves.toBe(false);
    });

    it('returns false when success is missing from the response', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }),
      );
      await expect(verifyTurnstileToken('some-token')).resolves.toBe(false);
    });

    it('returns false when the fetch throws (network failure)', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network down'));
      await expect(verifyTurnstileToken('some-token')).resolves.toBe(false);
    });

    it('returns false when the response body cannot be parsed as JSON', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('not-json', { status: 200 }),
      );
      await expect(verifyTurnstileToken('some-token')).resolves.toBe(false);
    });
  });
});
