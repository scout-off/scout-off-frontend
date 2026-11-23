import type { NextRequest } from 'next/server';

/**
 * Helpers for /api/csp-report: body size cap, report normalization and
 * duplicate-report sampling. Kept out of the route module because Next.js
 * only allows HTTP handlers and route config as route exports.
 */

export const MAX_BODY_BYTES = 16 * 1024;
const MAX_FIELD_LENGTH = 512;
export const CSP_RATE_LIMIT = { limit: 20, windowMs: 60_000 };
// Identical reports (same directive + blocked URI + document) are logged at
// most once per window — a single misconfigured page can otherwise emit the
// same violation on every page view.
const SAMPLE_WINDOW_MS = 60_000;
const MAX_SAMPLE_KEYS = 1000;
const recentReports = new Map<string, number>();

export const SUPPORTED_MEDIA_TYPES = new Set([
  'application/csp-report',
  'application/json',
  'application/reports+json',
]);

export interface NormalizedCspReport {
  documentUri?: string;
  violatedDirective?: string;
  effectiveDirective?: string;
  blockedUri?: string;
  sourceFile?: string;
  lineNumber?: number;
  disposition?: string;
}

export class PayloadTooLargeError extends Error {}

export function truncate(value: string): string {
  return value.length > MAX_FIELD_LENGTH
    ? value.slice(0, MAX_FIELD_LENGTH)
    : value;
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== ''
    ? truncate(value)
    : undefined;
}

/** Strip query string and fragment — they may carry tokens (e.g. `sig=`). */
function uri(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  const cut = value.search(/[?#]/);
  return truncate(cut === -1 ? value : value.slice(0, cut));
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function pick(
  raw: Record<string, unknown>,
  ...keys: string[]
): unknown | undefined {
  for (const key of keys) {
    if (raw[key] !== undefined) return raw[key];
  }
  return undefined;
}

/**
 * Normalize one report body. Accepts the legacy kebab-case fields
 * (`blocked-uri`) and the Reporting API camelCase fields (`blockedURL`).
 */
export function normalizeReport(raw: unknown): NormalizedCspReport | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    documentUri: uri(pick(r, 'document-uri', 'documentURL', 'documentUri')),
    violatedDirective: str(pick(r, 'violated-directive', 'violatedDirective')),
    effectiveDirective: str(
      pick(r, 'effective-directive', 'effectiveDirective'),
    ),
    blockedUri: uri(pick(r, 'blocked-uri', 'blockedURL', 'blockedUri')),
    sourceFile: uri(pick(r, 'source-file', 'sourceFile')),
    lineNumber: num(pick(r, 'line-number', 'lineNumber')),
    disposition: str(r.disposition),
  };
}

export function extractReports(mediaType: string, payload: unknown): unknown[] {
  if (mediaType === 'application/reports+json') {
    if (!Array.isArray(payload)) return [];
    return payload
      .filter(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          (entry as { type?: unknown }).type === 'csp-violation',
      )
      .map((entry) => (entry as { body?: unknown }).body);
  }
  if (payload && typeof payload === 'object' && 'csp-report' in payload) {
    return [(payload as Record<string, unknown>)['csp-report']];
  }
  return [payload];
}

export async function readBodyWithCap(request: NextRequest): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function shouldLog(report: NormalizedCspReport, now: number): boolean {
  const key = [
    report.effectiveDirective ?? report.violatedDirective,
    report.blockedUri,
    report.documentUri,
  ].join('|');
  const last = recentReports.get(key);
  if (last !== undefined && now - last < SAMPLE_WINDOW_MS) return false;
  if (recentReports.size >= MAX_SAMPLE_KEYS) recentReports.clear();
  recentReports.set(key, now);
  return true;
}

/** Test-only: clears the duplicate-report sampling window. */
export function _resetCspReportSamplingForTests(): void {
  recentReports.clear();
}
