/** @jest-environment node */
import { POST, GET } from '../../../app/api/csp-report/route';
import { NextRequest } from 'next/server';

function makeRequest(
  body: unknown,
  contentType = 'application/csp-report',
): NextRequest {
  return new NextRequest('http://localhost:3000/api/csp-report', {
    method: 'POST',
    headers: {
      'content-type': contentType,
      'user-agent': 'jest-test-agent',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/csp-report', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('accepts application/csp-report content and logs the violation', async () => {
    const report = {
      'csp-report': { 'blocked-uri': 'https://evil.com/script.js' },
    };
    const req = makeRequest(report, 'application/csp-report');

    const res = await POST(req);

    expect(res.status).toBe(204);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'CSP Violation Report:',
      expect.objectContaining({
        userAgent: 'jest-test-agent',
        report,
      }),
    );
  });

  it('accepts application/json content type as well', async () => {
    const report = { violated: 'default-src' };
    const req = makeRequest(report, 'application/json; charset=utf-8');

    const res = await POST(req);

    expect(res.status).toBe(204);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('returns 415 for an unsupported content type', async () => {
    const req = makeRequest({ foo: 'bar' }, 'text/plain');

    const res = await POST(req);

    expect(res.status).toBe(415);
    expect(await res.text()).toBe('Unsupported Media Type');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('returns 204 even when the JSON body is malformed', async () => {
    const req = makeRequest('not valid json{{{', 'application/json');

    const res = await POST(req);

    expect(res.status).toBe(204);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [message, error] = consoleErrorSpy.mock.calls[0];
    expect(message).toBe('Error processing CSP report:');
    expect(String(error)).toMatch(/not valid JSON|Unexpected token/);
  });
});

describe('GET /api/csp-report', () => {
  it('returns 405 Method Not Allowed', async () => {
    const res = await GET();

    expect(res.status).toBe(405);
    expect(await res.text()).toBe('Method Not Allowed');
  });
});
