import { NextRequest, NextResponse } from 'next/server';
import { createRequestLogger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  CSP_RATE_LIMIT,
  MAX_BODY_BYTES,
  PayloadTooLargeError,
  SUPPORTED_MEDIA_TYPES,
  extractReports,
  normalizeReport,
  readBodyWithCap,
  shouldLog,
  str,
  truncate,
} from '@/lib/cspReport';

/**
 * CSP Report Endpoint
 * Handles Content Security Policy violation reports
 *
 * Accepts both the legacy `report-uri` format (`application/csp-report`,
 * `application/json`) and the Reporting API format
 * (`application/reports+json`, an array of `{ type, body }` reports).
 *
 * Bodies are capped at MAX_BODY_BYTES, callers are rate-limited per IP,
 * and only a normalized, truncated, query-string-free subset of each
 * report is logged so the endpoint can't be used to flood the logs.
 */

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  const contentType = request.headers.get('content-type') ?? '';
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
    return new NextResponse('Unsupported Media Type', { status: 415 });
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return new NextResponse('Payload Too Large', { status: 413 });
  }

  // Rate-limited callers get a silent 204 so browsers don't retry loudly.
  const rl = await checkRateLimit(
    `csp:${getClientIp(request)}`,
    CSP_RATE_LIMIT,
  );
  if (rl.limited) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const payload = JSON.parse(await readBodyWithCap(request));
    const now = Date.now();
    const userAgent = str(request.headers.get('user-agent'));

    for (const raw of extractReports(mediaType, payload)) {
      const report = normalizeReport(raw);
      if (!report || !shouldLog(report, now)) continue;
      log.info('CSP violation report received', { userAgent, report });
    }

    // Return 204 No Content as per CSP specification
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return new NextResponse('Payload Too Large', { status: 413 });
    }
    log.error('Failed to process CSP report', {
      reason: truncate(error instanceof Error ? error.message : String(error)),
    });
    // Still return 204 to avoid cascading errors
    return new NextResponse(null, { status: 204 });
  }
}

/**
 * GET handler for endpoint verification
 * Returns 405 Method Not Allowed for GET requests
 */
export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
