import { parseContractError } from "@/lib/contract";

describe("parseContractError", () => {
  test("returns human-readable text for all mapped contract error codes", () => {
    expect(parseContractError(1)).toBe("Contract is already initialized.");
    expect(parseContractError(2)).toBe("Contract is not initialized.");
    expect(parseContractError(3)).toBe("Player not found. Player ID does not exist.");
    expect(parseContractError(4)).toBe("Unauthorized validator. Caller is not an approved validator.");
    expect(parseContractError(5)).toBe("Invalid milestone data. Milestone data is empty or malformed.");
    expect(parseContractError(6)).toBe("Player is already at this level.");
    expect(parseContractError(7)).toBe("Insufficient fee. XLM fee is too low.");
    expect(parseContractError(8)).toBe("Subscription expired. Scout subscription has lapsed.");
    expect(parseContractError(9)).toBe("Contract is currently paused.");
    expect(parseContractError(10)).toBe("Unauthorized. Caller is not authorized.");
    expect(parseContractError(11)).toBe("No fees to withdraw. No accumulated platform fees are available.");
    expect(parseContractError(12)).toBe("Overflow. Arithmetic overflow occurred in fee calculation.");
  });

  test("returns generic fallback for unmapped error codes", () => {
    expect(parseContractError(0)).toBe("Unknown contract error");
    expect(parseContractError(99)).toBe("Unknown contract error");
  });
});
