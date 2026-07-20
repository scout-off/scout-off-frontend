import { NextRequest, NextResponse } from 'next/server';
import { getReferralCount, getCodesByScout } from '@/lib/referralStore';
import { getValidSession } from '@/lib/sessionStore';

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get('session')?.value;
  const session = sessionId ? getValidSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const codes = getCodesByScout(session.publicKey);
  const count = getReferralCount(session.publicKey);

  return NextResponse.json({
    totalCodes: codes.length,
    successfulReferrals: count,
  });
}
