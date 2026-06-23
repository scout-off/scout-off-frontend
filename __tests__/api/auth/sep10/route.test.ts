import { POST } from "../../../../app/api/auth/sep10/route";
import { NextRequest } from "next/server";

// Mock stellar-sdk so tests don't need real Stellar keys or network access
jest.mock("@stellar/stellar-sdk", () => ({
  WebAuth: {
    verifyChallengeTxSigners: jest.fn(),
  },
  Networks: {
    TESTNET: "Test SDF Network ; September 2015",
    PUBLIC: "Public Global Stellar Network ; September 2015",
  },
}));

import { WebAuth } from "@stellar/stellar-sdk";
const mockVerify = WebAuth.verifyChallengeTxSigners as jest.Mock;

const ALLOWED_ORIGIN = "https://app.scoutoff.com";
const VALID_PUBLIC_KEY = "GBXXXXXXXXVALIDSTELLARACCOUNTID0000000000000000000000000000";
const SIGNED_XDR = "AAAAAQAAAA...signedchallenge...XDR==";

function makeRequest(
  origin: string | null,
  body: Record<string, unknown> = { signedXdr: SIGNED_XDR, publicKey: VALID_PUBLIC_KEY }
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
  process.env.SEP10_SERVER_KEY = "GBSERVERKEY0000000000000000000000000000000000000000000000000";
  process.env.SEP10_HOME_DOMAIN = "scoutoff.com";
  process.env.NEXT_PUBLIC_NETWORK = "testnet";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_BASE_URL;
  delete process.env.SEP10_SERVER_KEY;
  delete process.env.SEP10_HOME_DOMAIN;
});

describe("POST /api/auth/sep10 — origin validation", () => {
  test("returns 403 when Origin header is missing", async () => {
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  test("returns 403 when Origin does not match allowed origin", async () => {
    const res = await POST(makeRequest("https://evil.com"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  test("returns 403 for a subdomain that is not an exact match", async () => {
    const res = await POST(makeRequest("https://sub.app.scoutoff.com"));
    expect(res.status).toBe(403);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  test("returns 403 when scheme differs (http vs https)", async () => {
    const res = await POST(makeRequest("http://app.scoutoff.com"));
    expect(res.status).toBe(403);
    expect(mockVerify).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/sep10 — successful authentication", () => {
  test("returns 200 and sets session cookie when origin matches and SEP-10 verifies", async () => {
    mockVerify.mockReturnValueOnce(undefined); // resolves without throwing

    const res = await POST(makeRequest(ALLOWED_ORIGIN));

    expect(res.status).toBe(200);
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledWith(
      SIGNED_XDR,
      process.env.SEP10_SERVER_KEY,
      "Test SDF Network ; September 2015",
      [VALID_PUBLIC_KEY],
      "scoutoff.com",
      "scoutoff.com"
    );

    const body = await res.json();
    expect(body).toEqual({ success: true });

    const cookie = res.cookies.get("session");
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe(VALID_PUBLIC_KEY);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.path).toBe("/");
  });
});

describe("POST /api/auth/sep10 — SEP-10 verification failures", () => {
  test("returns 401 when stellar challenge verification fails", async () => {
    mockVerify.mockImplementationOnce(() => {
      throw new Error("Transaction not signed by client");
    });

    const res = await POST(makeRequest(ALLOWED_ORIGIN));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Transaction not signed by client" });
  });
});

describe("POST /api/auth/sep10 — malformed request body", () => {
  test("returns 400 for non-JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/sep10", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: ALLOWED_ORIGIN },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/sep10 — origin fallback to Host header", () => {
  test("allows request when NEXT_PUBLIC_BASE_URL is unset and Origin matches Host", async () => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    mockVerify.mockReturnValueOnce(undefined);

    const req = new NextRequest("http://localhost:3000/api/auth/sep10", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        host: "localhost:3000",
        // no x-forwarded-proto → falls back to "http"
      },
      body: JSON.stringify({ signedXdr: SIGNED_XDR, publicKey: VALID_PUBLIC_KEY }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  test("blocks request when NEXT_PUBLIC_BASE_URL is unset and Origin mismatches Host", async () => {
    delete process.env.NEXT_PUBLIC_BASE_URL;

    const req = new NextRequest("http://localhost:3000/api/auth/sep10", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.com",
        host: "localhost:3000",
      },
      body: JSON.stringify({ signedXdr: SIGNED_XDR, publicKey: VALID_PUBLIC_KEY }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
