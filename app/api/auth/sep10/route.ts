import { Keypair, WebAuth, Networks } from '@stellar/stellar-sdk';
import { NextRequest, NextResponse } from 'next/server';

// Initialise lazily so module-level evaluation during Next.js build does not
// throw when STELLAR_SECRET_KEY is absent (the fallback placeholder is not a
// valid Stellar secret and would fail the checksum on Keypair.fromSecret).
function getServerConfig() {
  const SECRET_KEY = process.env.STELLAR_SECRET_KEY;
  if (!SECRET_KEY) {
    throw new Error('STELLAR_SECRET_KEY environment variable is not set');
  }
  const serverKeypair = Keypair.fromSecret(SECRET_KEY);
  const NETWORK =
    process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
      ? Networks.PUBLIC
      : Networks.TESTNET;
  const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN || 'localhost:3000';
  return { serverKeypair, NETWORK, DOMAIN };
}

export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get('account');
  if (!account) {
    return NextResponse.json(
      { error: 'Missing account parameter' },
      { status: 400 },
    );
  }

  try {
    const { serverKeypair, NETWORK, DOMAIN } = getServerConfig();
    const challengeXdr = WebAuth.buildChallengeTx(
      serverKeypair,
      account,
      DOMAIN,
      300,
      NETWORK,
      DOMAIN,
    );
    return NextResponse.json({ transaction: challengeXdr });
  } catch (error) {
    console.error('SEP-10 Challenge Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate challenge' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { transaction } = await req.json();
    if (!transaction) {
      return NextResponse.json(
        { error: 'Missing transaction' },
        { status: 400 },
      );
    }

    const { serverKeypair, NETWORK, DOMAIN } = getServerConfig();
    // readChallengeTx validates the server signature and extracts the client account ID
    const { clientAccountID } = WebAuth.readChallengeTx(
      transaction,
      serverKeypair.publicKey(),
      NETWORK,
      DOMAIN,
      DOMAIN,
    );

    const response = NextResponse.json({
      success: true,
      publicKey: clientAccountID,
    });

    response.cookies.set('session', clientAccountID, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('SEP-10 Verification Error:', error);
    return NextResponse.json(
      { error: 'Invalid challenge transaction' },
      { status: 401 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('session');
  return response;
}
