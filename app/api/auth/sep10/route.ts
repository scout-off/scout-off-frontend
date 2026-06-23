import { NextRequest, NextResponse } from "next/server";
import { WebAuth, Networks, Keypair } from "@stellar/stellar-sdk";
import { checkRateLimit } from "@/lib/rateLimit";

const NETWORK =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

const CHALLENGE_LIMIT = 10;
const WINDOW_MS = 60_000;

function getIp(req: NextRequest): string {
  return (
    req.ip ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

function allowedOrigin(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const { allowed, retryAfter } = checkRateLimit(
    `sep10:${getIp(req)}`,
    CHALLENGE_LIMIT,
    WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const account = req.nextUrl.searchParams.get("account");
  if (!account) {
    return NextResponse.json({ error: "Missing account parameter" }, { status: 400 });
  }

  const serverSecret = process.env.SEP10_SERVER_SECRET!;
  const homeDomain = process.env.SEP10_HOME_DOMAIN!;

  try {
    const serverKeypair = Keypair.fromSecret(serverSecret);
    const challengeXdr = WebAuth.buildChallengeTx(
      serverKeypair,
      account,
      homeDomain,
      300,
      NETWORK,
      homeDomain
    );
    return NextResponse.json({ transaction: challengeXdr });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Challenge generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== allowedOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let signedXdr: string;
  let publicKey: string;
  try {
    ({ signedXdr, publicKey } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const serverPublicKey = process.env.SEP10_SERVER_KEY!;
  const homeDomain = process.env.SEP10_HOME_DOMAIN!;

  try {
    WebAuth.verifyChallengeTxSigners(
      signedXdr,
      serverPublicKey,
      NETWORK,
      [publicKey],
      homeDomain,
      homeDomain
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set("session", publicKey, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return res;
}
