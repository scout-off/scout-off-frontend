import { CONTRACT_ERRORS, ContractError, isContractError } from "../../types/index";

describe("ContractError utilities", () => {
  it("should identify valid ContractError objects", () => {
    const error: ContractError = { code: 3, message: "PlayerNotFound" };

    expect(isContractError(error)).toBe(true);
  });

  it("should reject invalid objects", () => {
    expect(isContractError(null)).toBe(false);
    expect(isContractError({})).toBe(false);
    expect(isContractError({ code: "3", message: "PlayerNotFound" })).toBe(false);
    expect(isContractError({ code: 3, message: 123 })).toBe(false);
  });

  it("should include all 12 documented error definitions", () => {
    const expected: Array<[number, string]> = [
      [1, "AlreadyInitialized"],
      [2, "NotInitialized"],
      [3, "PlayerNotFound"],
      [4, "UnauthorizedValidator"],
      [5, "InvalidMilestone"],
      [6, "AlreadyAtLevel"],
      [7, "InsufficientFee"],
      [8, "SubscriptionExpired"],
      [9, "ContractPaused"],
      [10, "Unauthorized"],
      [11, "NoFeesToWithdraw"],
      [12, "Overflow"],
    ];

    expect(Object.keys(CONTRACT_ERRORS).length).toBe(12);

    expected.forEach(([code, message]) => {
      expect(CONTRACT_ERRORS[code]).toBe(message);
    });
  });
});
