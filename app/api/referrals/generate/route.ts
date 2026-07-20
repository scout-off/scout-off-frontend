import { NextRequest, NextResponse } from 'next/server';
import { generateCode } from '@/lib/referralStore';
import { getValidSession } from '@/lib/sessionStore';

export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get('session')?.value;
  const session = sessionId ? getValidSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const referral = generateCode(session.publicKey);
  return NextResponse.json(referral);
}
