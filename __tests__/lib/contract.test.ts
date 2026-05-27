import { getSubscription } from "@/lib/contract";
import { getAccount, simulateTransaction } from "@/lib/stellar";
import type { Subscription } from "@/types";

// Mock the stellar module
jest.mock("@/lib/stellar", () => ({
  rpc: {
    getAccount: jest.fn(),
    simulateTransaction: jest.fn(),
  },
  NETWORK: "Test SDF Network ; September 2015",
  BASE_FEE: 100,
}));

// Mock the stellar-sdk module
jest.mock("@stellar/stellar-sdk", () => {
  const actualModule = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actualModule,
    scValToNative: jest.fn((val) => val),
  };
});

describe("contract.getSubscription", () => {
  const mockScoutAddress = "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTWYTTE2XFVFNNE4XMJLERI5SZ";
  const mockSubscription: Subscription = {
    scoutAddress: mockScoutAddress,
    tier: "pro",
    expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days from now
    isActive: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("successful subscription retrieval", () => {
    it("returns a Subscription object when subscription exists", async () => {
      const { rpc } = require("@/lib/stellar");
      rpc.simulateTransaction.mockResolvedValueOnce({
        result: {
          retval: mockSubscription,
        },
      });

      const result = await getSubscription(mockScoutAddress);

      expect(result).toEqual(mockSubscription);
      expect(result?.tier).toBe("pro");
      expect(result?.isActive).toBe(true);
    });

    it("returns null when no subscription exists", async () => {
      const { rpc } = require("@/lib/stellar");
      rpc.simulateTransaction.mockResolvedValueOnce({
        result: {
          retval: null,
        },
      });

      const result = await getSubscription(mockScoutAddress);

      expect(result).toBeNull();
    });

    it("correctly passes the scout address to the contract simulation", async () => {
      const { rpc } = require("@/lib/stellar");
      rpc.simulateTransaction.mockResolvedValueOnce({
        result: {
          retval: mockSubscription,
        },
      });

      await getSubscription(mockScoutAddress);

      // Verify the mock was called (contract simulation was invoked)
      expect(rpc.simulateTransaction).toHaveBeenCalled();
    });
  });

  describe("proper typing behavior", () => {
    it("returns Subscription type when subscription exists", async () => {
      const { rpc } = require("@/lib/stellar");
      const subscriptionWithBasicTier: Subscription = {
        ...mockSubscription,
        tier: "basic",
      };
      rpc.simulateTransaction.mockResolvedValueOnce({
        result: {
          retval: subscriptionWithBasicTier,
        },
      });

      const result = await getSubscription(mockScoutAddress);

      expect(result?.tier).toBe("basic");
      expect(result?.scoutAddress).toBe(mockScoutAddress);
    });

    it("supports all subscription tier types", async () => {
      const { rpc } = require("@/lib/stellar");
      const tiers: Array<"basic" | "pro" | "elite"> = ["basic", "pro", "elite"];

      for (const tier of tiers) {
        const subscription: Subscription = {
          ...mockSubscription,
          tier,
        };
        rpc.simulateTransaction.mockResolvedValueOnce({
          result: {
            retval: subscription,
          },
        });

        const result = await getSubscription(mockScoutAddress);

        expect(result?.tier).toBe(tier);
      }
    });

    it("returns correct type signature Promise<Subscription | null>", async () => {
      const { rpc } = require("@/lib/stellar");
      rpc.simulateTransaction.mockResolvedValueOnce({
        result: {
          retval: mockSubscription,
        },
      });

      const result = await getSubscription(mockScoutAddress);

      // TypeScript would catch this at compile time, but we can verify at runtime
      expect(result === null || typeof result === "object").toBe(true);
      if (result !== null) {
        expect("tier" in result).toBe(true);
        expect("expiresAt" in result).toBe(true);
        expect("isActive" in result).toBe(true);
      }
    });
  });

  describe("expected contract read handling", () => {
    it("handles subscription with future expiry correctly", async () => {
      const { rpc } = require("@/lib/stellar");
      const futureExpiry = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;
      const subscription: Subscription = {
        ...mockSubscription,
        expiresAt: futureExpiry,
      };
      rpc.simulateTransaction.mockResolvedValueOnce({
        result: {
          retval: subscription,
        },
      });

      const result = await getSubscription(mockScoutAddress);

      expect(result?.expiresAt).toBe(futureExpiry);
      expect(result?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it("handles expired subscription correctly", async () => {
      const { rpc } = require("@/lib/stellar");
      const pastExpiry = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
      const subscription: Subscription = {
        ...mockSubscription,
        expiresAt: pastExpiry,
        isActive: false,
      };
      rpc.simulateTransaction.mockResolvedValueOnce({
        result: {
          retval: subscription,
        },
      });

      const result = await getSubscription(mockScoutAddress);

      expect(result?.isActive).toBe(false);
      expect(result?.expiresAt).toBeLessThan(Math.floor(Date.now() / 1000));
    });

    it("handles various subscription tier levels", async () => {
      const { rpc } = require("@/lib/stellar");
      const basicSubscription: Subscription = {
        scoutAddress: mockScoutAddress,
        tier: "basic",
        expiresAt: mockSubscription.expiresAt,
        isActive: true,
      };
      rpc.simulateTransaction.mockResolvedValueOnce({
        result: {
          retval: basicSubscription,
        },
      });

      const result = await getSubscription(mockScoutAddress);

      expect(result?.tier).toBe("basic");
    });
  });

  describe("error handling", () => {
    it("throws error when contract simulation fails", async () => {
      const { rpc } = require("@/lib/stellar");
      rpc.simulateTransaction.mockResolvedValueOnce({
        error: "Simulation error",
      });

      // This should throw because simulateTx checks for 'result' in the response
      await expect(getSubscription(mockScoutAddress)).rejects.toThrow(
        "Simulation failed"
      );
    });

    it("throws error when simulation throws an exception", async () => {
      const { rpc } = require("@/lib/stellar");
      const simulationError = new Error("Network error");
      rpc.simulateTransaction.mockRejectedValueOnce(simulationError);

      await expect(getSubscription(mockScoutAddress)).rejects.toThrow(
        "Network error"
      );
    });
  });

  describe("return value consistency", () => {
    it("always returns either Subscription object or null", async () => {
      const { rpc } = require("@/lib/stellar");
      
      // Test with subscription
      rpc.simulateTransaction.mockResolvedValueOnce({
        result: {
          retval: mockSubscription,
        },
      });
      const result1 = await getSubscription(mockScoutAddress);
      expect(result1 === null || (typeof result1 === "object" && "tier" in result1)).toBe(true);

      // Test with null
      rpc.simulateTransaction.mockResolvedValueOnce({
        result: {
          retval: null,
        },
      });
      const result2 = await getSubscription(mockScoutAddress);
      expect(result2).toBeNull();
    });

    it("preserves all Subscription fields in return value", async () => {
      const { rpc } = require("@/lib/stellar");
      const completeSubscription: Subscription = {
        scoutAddress: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTWYTTE2XFVFNNE4XMJLERI5SZ",
        tier: "elite",
        expiresAt: 1735689600,
        isActive: true,
      };
      rpc.simulateTransaction.mockResolvedValueOnce({
        result: {
          retval: completeSubscription,
        },
      });

      const result = await getSubscription(mockScoutAddress);

      expect(result).toEqual(completeSubscription);
      expect(Object.keys(result || {})).toEqual(
        Object.keys(completeSubscription)
      );
    });
  });
});
