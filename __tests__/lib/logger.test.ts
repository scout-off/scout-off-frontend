/** @jest-environment node */
import { NextResponse } from 'next/server';
import {
  createRequestLogger,
  getOrCreateRequestId,
  withRequestId,
  REQUEST_ID_HEADER,
} from '@/lib/logger';

function makeRequest(
  url: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, { headers });
}

describe('lib/logger', () => {
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

  describe('getOrCreateRequestId', () => {
    it('propagates an incoming x-request-id header', () => {
      const req = makeRequest('https://example.com/api/foo', {
        [REQUEST_ID_HEADER]: 'incoming-id-123',
      });
      expect(getOrCreateRequestId(req)).toBe('incoming-id-123');
    });

    it('generates a fresh id when there is no incoming header', () => {
      const req = makeRequest('https://example.com/api/foo');
      const id = getOrCreateRequestId(req);
      expect(id).toEqual(expect.any(String));
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('createRequestLogger', () => {
    it('uses the same request id across info/warn/error calls', () => {
      const req = makeRequest('https://example.com/api/foo', {
        [REQUEST_ID_HEADER]: 'shared-id',
      });
      const log = createRequestLogger(req);
      expect(log.requestId).toBe('shared-id');

      log.info('hello');
      log.warn('careful');
      log.error('boom');

      const parsedLog = JSON.parse(logSpy.mock.calls[0][0]);
      const parsedWarn = JSON.parse(warnSpy.mock.calls[0][0]);
      const parsedError = JSON.parse(errorSpy.mock.calls[0][0]);

      expect(parsedLog.requestId).toBe('shared-id');
      expect(parsedWarn.requestId).toBe('shared-id');
      expect(parsedError.requestId).toBe('shared-id');
    });

    it('emits structured JSON with level, route, message, and timestamp', () => {
      const req = makeRequest('https://example.com/api/auth/sep10');
      const log = createRequestLogger(req);

      log.error('Verification failed', { statusCode: 401 });

      const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
      expect(parsed).toMatchObject({
        level: 'error',
        route: '/api/auth/sep10',
        message: 'Verification failed',
        statusCode: 401,
      });
      expect(typeof parsed.timestamp).toBe('string');
      expect(new Date(parsed.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('redacts sensitive field names', () => {
      const req = makeRequest('https://example.com/api/foo');
      const log = createRequestLogger(req);

      log.info('token exchange', {
        signedXdr: 'AAAA...',
        password: 'hunter2',
        contactEmail: 'player@example.com',
        safeField: 'this is fine',
      });

      const parsed = JSON.parse(logSpy.mock.calls[0][0]);
      expect(parsed.signedXdr).toBe('[REDACTED]');
      expect(parsed.password).toBe('[REDACTED]');
      expect(parsed.contactEmail).toBe('[REDACTED]');
      expect(parsed.safeField).toBe('this is fine');
    });

    it('routes info/warn/error to their matching console method', () => {
      const req = makeRequest('https://example.com/api/foo');
      const log = createRequestLogger(req);

      log.info('a');
      log.warn('b');
      log.error('c');

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('withRequestId', () => {
    it('stamps the request id onto the response headers', () => {
      const response = NextResponse.json({ ok: true });
      const stamped = withRequestId(response, 'req-42');
      expect(stamped.headers.get(REQUEST_ID_HEADER)).toBe('req-42');
    });
  });
});
