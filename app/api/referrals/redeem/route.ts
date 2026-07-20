import { NextRequest, NextResponse } from 'next/server';
import { redeemCode } from '@/lib/referralStore';
import { getValidSession } from '@/lib/sessionStore';

export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get('session')?.value;
  const session = sessionId ? getValidSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  if (!body.code) {
    return NextResponse.json(
      { error: 'Missing referral code' },
      { status: 400 },
    );
  }

  const ok = redeemCode(body.code, session.publicKey);
  if (!ok) {
    return NextResponse.json(
      { error: 'Invalid or already redeemed code' },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
