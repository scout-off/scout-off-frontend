import { WebAuth, Networks, Keypair } from '@stellar/stellar-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createRequestLogger, withRequestId } from '@/lib/logger';

const DEFAULT_SESSION_SECS = 60 * 60 * 24; // 1 day
const REMEMBER_ME_SESSION_SECS = 60 * 60 * 24 * 30; // 30 days

// Returns the set of origins this route will accept requests from. This is
// derived ONLY from server-controlled configuration (env vars) — never from
// the incoming request's own Host/X-Forwarded-Proto headers, which a caller
// fully controls and could otherwise use to make `origin === allowed` a
// self-referential, always-true check (see #659).
function getAllowedOrigins(): string[] {
  const allowList = process.env.SEP10_ALLOWED_ORIGINS;
  const origins = new Set<string>();

  if (allowList) {
    for (const entry of allowList.split(',')) {
      const trimmed = entry.trim();
      if (trimmed) origins.add(trimmed);
    }
  }

  // Honor NEXT_PUBLIC_BASE_URL as a convenience single-origin entry, kept
  // for backward compatibility — folded into the allow-list rather than
  // used as a separate fallback path.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (baseUrl) origins.add(baseUrl);

  if (origins.size > 0) return [...origins];

  // No allow-list configured. In production this must fail closed — do not
  // derive an "allowed" origin from anything on the request itself.
  if (process.env.NODE_ENV === 'production') return [];

  // Local development convenience default, based on NEXT_PUBLIC_DOMAIN
  // (see .env.example, defaults to `localhost:3000`) — never derived from
  // the request.
  const domain = process.env.NEXT_PUBLIC_DOMAIN || 'localhost:3000';
  return [`http://${domain}`];
}

export async function POST(req: NextRequest) {
  const log = createRequestLogger(req);
  const origin = req.headers.get('origin');
  const allowedOrigins = getAllowedOrigins();

  if (
    !origin ||
    allowedOrigins.length === 0 ||
    !allowedOrigins.includes(origin)
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { signedXdr?: string; publicKey?: string; rememberMe?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const { signedXdr, publicKey, rememberMe } = body ?? {};
  if (!signedXdr || !publicKey) {
    return NextResponse.json(
      { error: 'Missing signedXdr or publicKey' },
      { status: 400 },
    );
  }

  const serverKey = process.env.SEP10_SERVER_KEY ?? '';
  const homeDomain = process.env.SEP10_HOME_DOMAIN ?? '';
  const network =
    process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
      ? Networks.PUBLIC
      : Networks.TESTNET;

  try {
    // verifyChallengeTxSigners' second argument is the server's *public* key
    // (compared directly against the challenge transaction's source
    // account) — passing the raw secret seed here always fails with
    // "the transaction source account is not equal to the server's account".
    const serverAccountId = Keypair.fromSecret(serverKey).publicKey();
    WebAuth.verifyChallengeTxSigners(
      signedXdr,
      serverAccountId,
      network,
      [publicKey],
      homeDomain,
      homeDomain,
    );

    const maxAge = rememberMe ? REMEMBER_ME_SESSION_SECS : DEFAULT_SESSION_SECS;

    const response = NextResponse.json({ success: true, maxAge });
    response.cookies.set('session', publicKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge,
    });
    return withRequestId(response, log.requestId);
  } catch (error) {
    log.error('SEP-10 verification failed', {
      reason: error instanceof Error ? error.message : String(error),
    });
    return withRequestId(
      NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Verification failed',
        },
        { status: 401 },
      ),
      log.requestId,
    );
  }
}

export async function GET(req: NextRequest) {
  const log = createRequestLogger(req);
  const account = req.nextUrl.searchParams.get('account');
  if (!account) {
    return NextResponse.json(
      { error: 'Missing account parameter' },
      { status: 400 },
    );
  }

  const serverKey = process.env.SEP10_SERVER_KEY;
  if (!serverKey) {
    return NextResponse.json(
      { error: 'Server not configured' },
      { status: 500 },
    );
  }

  const homeDomain = process.env.SEP10_HOME_DOMAIN ?? '';
  const network =
    process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
      ? Networks.PUBLIC
      : Networks.TESTNET;

  try {
    const { Keypair } = await import('@stellar/stellar-sdk');
    const serverKeypair = Keypair.fromSecret(serverKey);
    const { buildChallengeTx } = (await import('@stellar/stellar-sdk')).WebAuth;
    const challengeXdr = buildChallengeTx(
      serverKeypair,
      account,
      homeDomain,
      300,
      network,
      homeDomain,
    );
    return NextResponse.json({ transaction: challengeXdr });
  } catch (error) {
    log.error('SEP-10 challenge generation failed', {
      reason: error instanceof Error ? error.message : String(error),
    });
    return withRequestId(
      NextResponse.json(
        { error: 'Failed to generate challenge' },
        { status: 500 },
      ),
      log.requestId,
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('session');
  return response;
}
