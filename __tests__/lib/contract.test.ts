// Mock stellar-sdk to avoid real SDK/network calls.
jest.mock("@stellar/stellar-sdk", () => ({
  Contract: jest.fn().mockImplementation(() => ({
    call: jest.fn().mockReturnValue({}),
  })),
  nativeToScVal: jest.fn().mockReturnValue({}),
  scValToNative: jest.fn().mockReturnValue({}),
  xdr: {},
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({ toXDR: jest.fn().mockReturnValue("mock-xdr") }),
  })),
  Account: jest.fn(),
}));

// Mock lib/stellar — rpc never gets called for invalid addresses.
// isValidStellarAddress uses a simple structural check matching real Ed25519 key rules.
jest.mock("../../lib/stellar", () => ({
  rpc: {
    getAccount: jest.fn().mockResolvedValue({}),
    prepareTransaction: jest.fn().mockResolvedValue({ toXDR: () => "prepared-xdr" }),
    simulateTransaction: jest.fn().mockResolvedValue({ result: { retval: {} } }),
  },
  NETWORK: "Test SDF Network ; September 2015",
  BASE_FEE: "100",
  isValidStellarAddress: jest.fn(
    (key: string) => typeof key === "string" && /^G[A-Z2-7]{55}$/.test(key)
  ),
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "ValidationError";
    }
  },
}));

import {
  buildRegisterPlayer,
  buildApproveMilestone,
  buildPayToContact,
  filterPlayers,
} from "../../lib/contract";
import { ValidationError } from "../../lib/errors";
import { rpc } from "../../lib/stellar";

const VALID_ADDRESS = "GBR6LYRKEFYV3MG322FYLED6PLOTEV77KCX6AZSR7V4RV7EJLIWOZJWQ";
const mockRpc = rpc as jest.Mocked<typeof rpc>;

beforeEach(() => jest.clearAllMocks());

// ── buildRegisterPlayer ───────────────────────────────────────────────────────

describe("buildRegisterPlayer", () => {
  const vitals = { name: "Ada", age: 22, position: "MF", region: "EU", nationality: "DE" };

  test("throws ValidationError for invalid wallet", async () => {
    await expect(buildRegisterPlayer("not-a-key", vitals, "QmHash")).rejects.toThrow(ValidationError);
    expect(mockRpc.getAccount).not.toHaveBeenCalled();
  });

  test("throws ValidationError for empty wallet", async () => {
    await expect(buildRegisterPlayer("", vitals, "QmHash")).rejects.toThrow(ValidationError);
    expect(mockRpc.getAccount).not.toHaveBeenCalled();
  });

  test("error message identifies the bad value and parameter", async () => {
    const err = await buildRegisterPlayer("bad", vitals, "QmHash").catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toMatch(/wallet/);
    expect(err.message).toMatch(/not a valid Stellar address/);
  });

  test("proceeds to RPC for a valid wallet address", async () => {
    await buildRegisterPlayer(VALID_ADDRESS, vitals, "QmHash");
    expect(mockRpc.getAccount).toHaveBeenCalledWith(VALID_ADDRESS);
  });
});

// ── buildApproveMilestone ─────────────────────────────────────────────────────

describe("buildApproveMilestone", () => {
  test("throws ValidationError for invalid validatorKey", async () => {
    await expect(buildApproveMilestone("bad-key", "player_1", "milestone_1")).rejects.toThrow(ValidationError);
    expect(mockRpc.getAccount).not.toHaveBeenCalled();
  });

  test("throws ValidationError for empty validatorKey", async () => {
    await expect(buildApproveMilestone("", "player_1", "milestone_1")).rejects.toThrow(ValidationError);
    expect(mockRpc.getAccount).not.toHaveBeenCalled();
  });

  test("error message identifies the parameter name", async () => {
    const err = await buildApproveMilestone("bad", "player_1", "ms").catch((e) => e);
    expect(err.message).toMatch(/validatorKey/);
  });

  test("proceeds to RPC for a valid validatorKey", async () => {
    await buildApproveMilestone(VALID_ADDRESS, "player_1", "milestone_1");
    expect(mockRpc.getAccount).toHaveBeenCalledWith(VALID_ADDRESS);
  });
});

// ── buildPayToContact ─────────────────────────────────────────────────────────

describe("buildPayToContact", () => {
  test("throws ValidationError for invalid scoutKey", async () => {
    await expect(buildPayToContact("//evil.com", "player_1")).rejects.toThrow(ValidationError);
    expect(mockRpc.getAccount).not.toHaveBeenCalled();
  });

  test("throws ValidationError for empty scoutKey", async () => {
    await expect(buildPayToContact("", "player_1")).rejects.toThrow(ValidationError);
    expect(mockRpc.getAccount).not.toHaveBeenCalled();
  });

  test("error message identifies the parameter name", async () => {
    const err = await buildPayToContact("oops", "player_1").catch((e) => e);
    expect(err.message).toMatch(/scoutKey/);
  });

  test("proceeds to RPC for a valid scoutKey", async () => {
    await buildPayToContact(VALID_ADDRESS, "player_1");
    expect(mockRpc.getAccount).toHaveBeenCalledWith(VALID_ADDRESS);
  });
});

// ── filterPlayers (no address params — must never throw ValidationError) ──────

describe("filterPlayers", () => {
  test("does not throw for any string arguments", async () => {
    await expect(filterPlayers("EU", "MF", 1)).resolves.not.toThrow();
    expect(mockRpc.simulateTransaction).toHaveBeenCalled();
  });
});

// ── ValidationError shape ─────────────────────────────────────────────────────

describe("ValidationError", () => {
  test("has name ValidationError", () => {
    const err = new ValidationError("bad input");
    expect(err.name).toBe("ValidationError");
  });

  test("extends Error", () => {
    expect(new ValidationError("x")).toBeInstanceOf(Error);
  });

  test("preserves the message", () => {
    expect(new ValidationError("bad input").message).toBe("bad input");
  });
});
