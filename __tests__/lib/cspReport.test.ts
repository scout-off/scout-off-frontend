/** @jest-environment node */
import { NextRequest } from 'next/server';
import {
  CSP_RATE_LIMIT,
  MAX_BODY_BYTES,
  PayloadTooLargeError,
  SUPPORTED_MEDIA_TYPES,
  _resetCspReportSamplingForTests,
  extractReports,
  normalizeReport,
  readBodyWithCap,
  shouldLog,
  str,
  truncate,
} from '@/lib/cspReport';

describe('constants', () => {
  it('caps bodies at 16 KiB', () => {
    expect(MAX_BODY_BYTES).toBe(16 * 1024);
  });

  it('exposes the per-IP rate limit window', () => {
    expect(CSP_RATE_LIMIT).toEqual({ limit: 20, windowMs: 60_000 });
  });

  it('lists the supported media types', () => {
    expect(SUPPORTED_MEDIA_TYPES.has('application/csp-report')).toBe(true);
    expect(SUPPORTED_MEDIA_TYPES.has('application/json')).toBe(true);
    expect(SUPPORTED_MEDIA_TYPES.has('application/reports+json')).toBe(true);
    expect(SUPPORTED_MEDIA_TYPES.has('text/plain')).toBe(false);
  });
});

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('short')).toBe('short');
  });

  it('truncates strings longer than MAX_FIELD_LENGTH (512)', () => {
    const long = 'a'.repeat(600);
    const result = truncate(long);
    expect(result.length).toBe(512);
    expect(result).toBe('a'.repeat(512));
  });

  it('leaves a 512-character string untouched', () => {
    const exact = 'b'.repeat(512);
    expect(truncate(exact)).toBe(exact);
  });
});

describe('str', () => {
  it('returns undefined for non-strings', () => {
    expect(str(null)).toBeUndefined();
    expect(str(undefined)).toBeUndefined();
    expect(str(42)).toBeUndefined();
    expect(str({ a: 1 })).toBeUndefined();
  });

  it('returns undefined for the empty string', () => {
    expect(str('')).toBeUndefined();
  });

  it('truncates a long string value', () => {
    expect(str('a'.repeat(600))).toBe('a'.repeat(512));
  });

  it('returns a normal string truncated to fit', () => {
    expect(str('hello')).toBe('hello');
  });
});

describe('normalizeReport', () => {
  it('returns null for null/undefined', () => {
    expect(normalizeReport(null)).toBeNull();
    expect(normalizeReport(undefined)).toBeNull();
  });

  it('returns null for non-object values', () => {
    expect(normalizeReport('string')).toBeNull();
    expect(normalizeReport(42)).toBeNull();
    expect(normalizeReport(true)).toBeNull();
  });

  it('returns null for arrays', () => {
    expect(normalizeReport([])).toBeNull();
  });

  it('maps the legacy kebab-case CSP report fields', () => {
    const report = normalizeReport({
      'document-uri': 'https://scoutoff.app/player/1',
      'violated-directive': 'script-src',
      'effective-directive': 'script-src-elem',
      'blocked-uri': 'https://evil.com/script.js',
      'source-file': 'https://scoutoff.app/app.js',
      'line-number': '42',
      disposition: 'enforce',
    });

    expect(report).toEqual({
      documentUri: 'https://scoutoff.app/player/1',
      violatedDirective: 'script-src',
      effectiveDirective: 'script-src-elem',
      blockedUri: 'https://evil.com/script.js',
      sourceFile: 'https://scoutoff.app/app.js',
      lineNumber: 42,
      disposition: 'enforce',
    });
  });

  it('maps the Reporting API camelCase fields', () => {
    const report = normalizeReport({
      documentURL: 'https://scoutoff.app/player/1',
      violatedDirective: 'script-src',
      effectiveDirective: 'script-src-elem',
      blockedURL: 'https://evil.com/script.js',
      sourceFile: 'https://scoutoff.app/app.js',
      lineNumber: 42,
      disposition: 'report-only',
    });

    expect(report).toEqual({
      documentUri: 'https://scoutoff.app/player/1',
      violatedDirective: 'script-src',
      effectiveDirective: 'script-src-elem',
      blockedUri: 'https://evil.com/script.js',
      sourceFile: 'https://scoutoff.app/app.js',
      lineNumber: 42,
      disposition: 'report-only',
    });
  });

  it('prefers the first present field when multiple aliases exist', () => {
    const report = normalizeReport({
      'document-uri': 'https://kebab.example/',
      documentURL: 'https://camel.example/',
    });
    expect(report?.documentUri).toBe('https://kebab.example/');
  });

  it('returns undefined for missing fields rather than empty strings', () => {
    const report = normalizeReport({});
    expect(report).toEqual({
      documentUri: undefined,
      violatedDirective: undefined,
      effectiveDirective: undefined,
      blockedUri: undefined,
      sourceFile: undefined,
      lineNumber: undefined,
      disposition: undefined,
    });
  });

  it('strips query strings and fragments from URIs (tokens live there)', () => {
    const report = normalizeReport({
      'document-uri': 'https://scoutoff.app/player/1?sig=secret',
      'blocked-uri': 'https://evil.com/x.js#fragment',
      'source-file': 'https://scoutoff.app/app.js?token=abc#h',
    });
    expect(report?.documentUri).toBe('https://scoutoff.app/player/1');
    expect(report?.blockedUri).toBe('https://evil.com/x.js');
    expect(report?.sourceFile).toBe('https://scoutoff.app/app.js');
  });

  it('truncates over-long URI fields', () => {
    const longUri = 'https://example.com/' + 'a'.repeat(600);
    const report = normalizeReport({ 'document-uri': longUri });
    expect(report?.documentUri?.length).toBe(512);
  });

  it('returns undefined for URIs that are not strings', () => {
    const report = normalizeReport({
      'document-uri': 12345,
      'blocked-uri': null,
    });
    expect(report?.documentUri).toBeUndefined();
    expect(report?.blockedUri).toBeUndefined();
  });

  it('rejects non-finite line numbers', () => {
    expect(
      normalizeReport({ 'line-number': 'not-a-number' })?.lineNumber,
    ).toBeUndefined();
    expect(normalizeReport({ 'line-number': Infinity })?.lineNumber).toBeUndefined();
    expect(normalizeReport({ 'line-number': NaN })?.lineNumber).toBeUndefined();
  });

  it('accepts numeric line numbers directly', () => {
    expect(normalizeReport({ 'line-number': 7 })?.lineNumber).toBe(7);
  });

  it('keeps disposition only when it is a non-empty string', () => {
    expect(normalizeReport({ disposition: '' })?.disposition).toBeUndefined();
    expect(normalizeReport({ disposition: 'enforce' })?.disposition).toBe(
      'enforce',
    );
    expect(normalizeReport({ disposition: 5 })?.disposition).toBeUndefined();
  });
});

describe('extractReports', () => {
  it('returns the body of csp-violation entries from a reports+json array', () => {
    const payload = [
      { type: 'csp-violation', body: { 'violated-directive': 'script-src' } },
      { type: 'other-event', body: { foo: 'bar' } },
      { type: 'csp-violation', body: { 'violated-directive': 'img-src' } },
      { not: 'an object' },
    ];

    const reports = extractReports('application/reports+json', payload);
    expect(reports).toEqual([
      { 'violated-directive': 'script-src' },
      { 'violated-directive': 'img-src' },
    ]);
  });

  it('filters out non-object or non-csp-violation entries', () => {
    const payload = [
      null,
      'string',
      { type: 'csp-violation' }, // missing body
      { type: 'something-else', body: { x: 1 } },
    ];
    expect(extractReports('application/reports+json', payload)).toEqual([]);
  });

  it('returns an empty array when the reports+json payload is not an array', () => {
    expect(extractReports('application/reports+json', { foo: 'bar' })).toEqual(
      [],
    );
    expect(extractReports('application/reports+json', null)).toEqual([]);
  });

  it('unwraps the legacy `csp-report` envelope', () => {
    const payload = {
      'csp-report': { 'violated-directive': 'script-src' },
    };
    expect(extractReports('application/csp-report', payload)).toEqual([
      { 'violated-directive': 'script-src' },
    ]);
  });

  it('unwraps the legacy envelope regardless of json/reports+json media type', () => {
    const payload = { 'csp-report': { a: 1 } };
    expect(extractReports('application/json', payload)).toEqual([{ a: 1 }]);
  });

  it('wraps a bare payload (no csp-report key) into a single-element array', () => {
    const payload = { 'violated-directive': 'script-src' };
    expect(extractReports('application/csp-report', payload)).toEqual([payload]);
    expect(extractReports('application/json', payload)).toEqual([payload]);
  });
});

describe('readBodyWithCap', () => {
  function makeRequest(body: string): NextRequest {
    return new NextRequest('http://localhost:3000/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body,
    });
  }

  it('returns the raw string for a small body', async () => {
    const body = '{"csp-report":{"violated-directive":"script-src"}}';
    const result = await readBodyWithCap(makeRequest(body));
    expect(result).toBe(body);
  });

  it('returns an empty string when the request has no body', async () => {
    const req = new NextRequest('http://localhost:3000/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
    });
    expect(await readBodyWithCap(req)).toBe('');
  });

  it('rejects a body that exceeds MAX_BODY_BYTES', async () => {
    // The reader yields chunks; an oversized body must throw after the cap
    // is exceeded, regardless of how the bytes arrive.
    const oversized = 'x'.repeat(MAX_BODY_BYTES + 1);
    await expect(readBodyWithCap(makeRequest(oversized))).rejects.toThrow(
      PayloadTooLargeError,
    );
  });

  it('accepts a body exactly at MAX_BODY_BYTES', async () => {
    const exact = 'y'.repeat(MAX_BODY_BYTES);
    const result = await readBodyWithCap(makeRequest(exact));
    expect(result.length).toBe(MAX_BODY_BYTES);
    expect(result).toBe(exact);
  });
});

describe('shouldLog', () => {
  const now = 1_000_000;
  const baseReport = {
    effectiveDirective: 'script-src',
    blockedUri: 'https://evil.com/script.js',
    documentUri: 'https://scoutoff.app/player/1',
  };

  beforeEach(() => {
    _resetCspReportSamplingForTests();
  });

  it('logs the first occurrence of a report', () => {
    expect(shouldLog(baseReport, now)).toBe(true);
  });

  it('suppresses an identical report inside the sample window', () => {
    expect(shouldLog(baseReport, now)).toBe(true);
    expect(shouldLog(baseReport, now + 30_000)).toBe(false);
  });

  it('logs an identical report again after the sample window elapses', () => {
    expect(shouldLog(baseReport, now)).toBe(true);
    expect(shouldLog(baseReport, now + 60_001)).toBe(true);
  });

  it('keys on effectiveDirective, falling back to violatedDirective', () => {
    const withViolated = {
      violatedDirective: 'img-src',
      blockedUri: 'https://evil.com/img.png',
      documentUri: 'https://scoutoff.app/player/1',
    };
    expect(shouldLog(withViolated, now)).toBe(true);
    // A different directive at the same URIs is a different report.
    expect(shouldLog(baseReport, now + 1_000)).toBe(true);
  });

  it('treats reports that differ only in blockedUri as distinct', () => {
    const other = { ...baseReport, blockedUri: 'https://other.com/script.js' };
    expect(shouldLog(baseReport, now)).toBe(true);
    expect(shouldLog(other, now + 1_000)).toBe(true);
  });

  it('treats reports that differ only in documentUri as distinct', () => {
    const other = {
      ...baseReport,
      documentUri: 'https://scoutoff.app/player/2',
    };
    expect(shouldLog(baseReport, now)).toBe(true);
    expect(shouldLog(other, now + 1_000)).toBe(true);
  });
});

describe('PayloadTooLargeError', () => {
  it('is an Error subclass', () => {
    const err = new PayloadTooLargeError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PayloadTooLargeError);
  });
});
