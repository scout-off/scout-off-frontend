import { GET, POST } from "../../../../app/api/auth/sep10/route";
import { NextRequest } from "next/server";

jest.mock("@stellar/stellar-sdk", () => ({
  WebAuth: {
    buildChallengeTx: jest.fn(),
    verifyChallengeTxSigners: jest.fn(),
  },
  Networks: {
    TESTNET: "Test SDF Network ; September 2015",
    PUBLIC: "Public Global Stellar Network ; September 2015",
  },
  Keypair: {
    fromSecret: jest.fn(() => ({ publicKey: () => "GBSERVERKEY" })),
  },
}));

jest.mock("../../../../lib/rateLimit", () => ({
  checkRateLimit: jest.fn(),
}));

import { WebAuth } from "@stellar/stellar-sdk";
import { checkRateLimit } from "../../../../lib/rateLimit";

const mockBuild = WebAuth.buildChallengeTx as jest.Mock;
const mockVerify = WebAuth.verifyChallengeTxSigners as jest.Mock;
const mockRateLimit = checkRateLimit as jest.Mock;

const ALLOWED_ORIGIN = "https://app.scoutoff.com";
const CLIENT_KEY = "GBCLIENTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const CHALLENGE_XDR = "AAAAAQAAAA...challenge...XDR==";
const SIGNED_XDR = "AAAAAQAAAA...signed...XDR==";

function makeGetRequest(account: string | null = CLIENT_KEY, ip = "1.2.3.4"): NextRequest {
  const url = account
    ? `http://localhost:3000/api/auth/sep10?account=${account}`
    : "http://localhost:3000/api/auth/sep10";
  return new NextRequest(url, {
    method: "GET",
    headers: { "x-forwarded-for": ip },
  });
}

function makePostRequest(
  origin: string | null,
  body: Record<string, unknown> = { signedXdr: SIGNED_XDR, publicKey: CLIENT_KEY }
): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin !== null) headers["origin"] = origin;
  return new NextRequest("http://localhost:3000/api/auth/sep10", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = ALLOWED_ORIGIN;
  process.env.SEP10_SERVER_SECRET = "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
  process.env.SEP10_SERVER_KEY = "GBSERVERKEY000000000000000000000000000000000000000000000";
  process.env.SEP10_HOME_DOMAIN = "scoutoff.com";
  process.env.NEXT_PUBLIC_NETWORK = "testnet";
  // Default: allow all requests
  mockRateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_BASE_URL;
  delete process.env.SEP10_SERVER_SECRET;
  delete process.env.SEP10_SERVER_KEY;
  delete process.env.SEP10_HOME_DOMAIN;
});

// ---------------------------------------------------------------------------
// GET — rate limiting
// ---------------------------------------------------------------------------

describe("GET /api/auth/sep10 — rate limiting", () => {
  test("returns 429 with Retry-After header when rate limit is exceeded", async () => {
    mockRateLimit.mockReturnValueOnce({ allowed: false, retryAfter: 45 });

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    const body = await res.json();
    expect(body).toEqual({ error: "Too Many Requests" });
    expect(mockBuild).not.toHaveBeenCalled();
  });

  test("passes the correct rate-limit key (ip-scoped)", async () => {
    mockBuild.mockReturnValueOnce(CHALLENGE_XDR);

    await GET(makeGetRequest(CLIENT_KEY, "5.6.7.8"));

    expect(mockRateLimit).toHaveBeenCalledWith("sep10:5.6.7.8", 10, 60_000);
  });

  test("returns challenge for requests within the limit", async () => {
    mockBuild.mockReturnValueOnce(CHALLENGE_XDR);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ transaction: CHALLENGE_XDR });
  });

  test("Retry-After is present and numeric when rate limited", async () => {
    mockRateLimit.mockReturnValueOnce({ allowed: false, retryAfter: 60 });

    const res = await GET(makeGetRequest());

    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// GET — challenge generation
// ---------------------------------------------------------------------------

describe("GET /api/auth/sep10 — challenge generation", () => {
  test("returns 400 when account query param is missing", async () => {
    const res = await GET(makeGetRequest(null));
    expect(res.status).toBe(400);
    expect(mockBuild).not.toHaveBeenCalled();
  });

  test("calls buildChallengeTx with correct args and returns XDR", async () => {
    mockBuild.mockReturnValueOnce(CHALLENGE_XDR);

    const res = await GET(makeGetRequest(CLIENT_KEY));

    expect(res.status).toBe(200);
    expect(mockBuild).toHaveBeenCalledTimes(1);
    const [, clientArg, domainArg, timeoutArg, networkArg] = mockBuild.mock.calls[0];
    expect(clientArg).toBe(CLIENT_KEY);
    expect(domainArg).toBe("scoutoff.com");
    expect(timeoutArg).toBe(300);
    expect(networkArg).toBe("Test SDF Network ; September 2015");
  });

  test("returns 500 when buildChallengeTx throws", async () => {
    mockBuild.mockImplementationOnce(() => {
      throw new Error("Invalid keypair");
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid keypair" });
  });
});

// ---------------------------------------------------------------------------
// POST — origin validation (existing behaviour, unchanged)
// ---------------------------------------------------------------------------

describe("POST /api/auth/sep10 — origin validation", () => {
  test("returns 403 when Origin header is missing", async () => {
    const res = await POST(makePostRequest(null));
    expect(res.status).toBe(403);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  test("returns 403 when Origin does not match", async () => {
    const res = await POST(makePostRequest("https://evil.com"));
    expect(res.status).toBe(403);
    expect(mockVerify).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST — successful authentication (existing behaviour, unchanged)
// ---------------------------------------------------------------------------

describe("POST /api/auth/sep10 — successful authentication", () => {
  test("returns 200 and sets session cookie for valid same-origin request", async () => {
    mockVerify.mockReturnValueOnce(undefined);

    const res = await POST(makePostRequest(ALLOWED_ORIGIN));

    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ success: true });

    const cookie = res.cookies.get("session");
    expect(cookie?.value).toBe(CLIENT_KEY);
    expect(cookie?.httpOnly).toBe(true);
  });
});
