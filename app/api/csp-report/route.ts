import { NextRequest, NextResponse } from 'next/server';

/**
 * CSP Report Endpoint
 * Handles Content Security Policy violation reports
 *
 * This endpoint receives CSP violation reports from browsers
 * and logs them for monitoring and debugging purposes.
 */
export async function POST(request: NextRequest) {
  try {
    const report = await request.json();

    // Log the CSP violation report
    console.log('CSP Violation Report:', {
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent'),
      report,
    });

    // Return 204 No Content as per CSP specification
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error processing CSP report:', error);
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
