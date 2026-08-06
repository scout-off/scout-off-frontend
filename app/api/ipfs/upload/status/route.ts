import { NextRequest, NextResponse } from 'next/server';
import { getSessionStatus } from '@/lib/chunkedUploadStore';

export const runtime = 'nodejs';

/**
 * GET /api/ipfs/upload/status?sessionId=...
 *
 * Reports which chunks a session has already received, so a client
 * resuming after an interruption knows exactly where to continue instead
 * of restarting from byte zero.
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId is required' },
      { status: 400 },
    );
  }

  const status = getSessionStatus(sessionId);
  if (!status) {
    return NextResponse.json(
      { error: 'Upload session not found or expired' },
      { status: 404 },
    );
  }

  return NextResponse.json(status);
}
