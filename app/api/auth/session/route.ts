import { NextRequest, NextResponse } from 'next/server';
import { getValidSession, renewSession } from '@/lib/sessionStore';

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get('session')?.value;
  const session = sessionId ? getValidSession(sessionId) : null;

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    publicKey: session.publicKey,
    expiresAt: session.expiresAt,
  });
}

/** Rotates the active session: issues a fresh cookie/expiry, revokes the old one. */
export async function PUT(req: NextRequest) {
  const sessionId = req.cookies.get('session')?.value;
  const renewed = sessionId ? renewSession(sessionId) : null;

  if (!renewed) {
    const response = NextResponse.json(
      { authenticated: false, error: 'Session expired or invalid' },
      { status: 401 },
    );
    response.cookies.delete('session');
    return response;
  }

  const response = NextResponse.json({
    authenticated: true,
    publicKey: renewed.publicKey,
    expiresAt: renewed.expiresAt,
  });
  response.cookies.set('session', renewed.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor((renewed.expiresAt - renewed.createdAt) / 1000),
  });
  return response;
}
