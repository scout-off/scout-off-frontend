import { Keypair, Utils, Networks } from '@stellar/stellar-sdk';
import { NextRequest, NextResponse } from 'next/server';

// In production, this should be a secure environment variable.
const SECRET_KEY =
  process.env.STELLAR_SECRET_KEY ||
  'SDAV7XESHT63OQQ3Q6L27W462O4ZORZCOV4UOOXF6S2A6SST2YJXY63G';
const serverKeypair = Keypair.fromSecret(SECRET_KEY);
const NETWORK =
  process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
    ? Networks.PUBLIC
    : Networks.TESTNET;
const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN || 'localhost:3000';

export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get('account');
  if (!account) {
    return NextResponse.json(
      { error: 'Missing account parameter' },
      { status: 400 },
    );
  }

  try {
    const challengeXdr = Utils.buildChallengeTx(
      serverKeypair,
      account,
      DOMAIN,
      300, // 5 minutes timeout
      NETWORK,
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

    const { tx } = Utils.verifyChallengeTx(
      transaction,
      serverKeypair.publicKey(),
      NETWORK,
      [DOMAIN],
    );

    const clientPublicKey = tx.source;

    // Use the public key as the session value for simplicity,
    // or you could sign a JWT here if needed.
    const response = NextResponse.json({
      success: true,
      publicKey: clientPublicKey,
    });

    response.cookies.set('session', clientPublicKey, {
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
