"use client";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { useSubscription } from "@/hooks/useSubscription";
import { SubscriptionTier } from "@/types";

// Mock useWallet
jest.mock("@/hooks/useWallet", () => ({
  useWallet: jest.fn(),
}));

// Mock lib/contract
jest.mock("@/lib/contract", () => ({
  getSubscription: jest.fn(),
  buildSubscribe: jest.fn(),
}));

import { useWallet } from "@/hooks/useWallet";
import { getSubscription, buildSubscribe } from "@/lib/contract";

const mockUseWallet = useWallet as jest.Mock;
const mockGetSubscription = getSubscription as jest.Mock;
const mockBuildSubscribe = buildSubscribe as jest.Mock;

describe("useSubscription", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("isExpired is true when expiresAt is in the past", async () => {
    const mockPublicKey = "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    const mockSignAndSubmit = jest.fn();
    mockUseWallet.mockReturnValue({
      publicKey: mockPublicKey,
      signAndSubmit: mockSignAndSubmit,
    });

    const mockSubscription = {
      scout: mockPublicKey,
      tier: SubscriptionTier.Basic,
      expiresAt: Date.now() / 1000 - 1000, // 1000 seconds in past
    };
    mockGetSubscription.mockResolvedValue(mockSubscription);

    const { result } = renderHook(() => useSubscription());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isExpired).toBe(true);
  });

  test("isExpired is false when expiresAt is in the future", async () => {
    const mockPublicKey = "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    const mockSignAndSubmit = jest.fn();
    mockUseWallet.mockReturnValue({
      publicKey: mockPublicKey,
      signAndSubmit: mockSignAndSubmit,
    });

    const mockSubscription = {
      scout: mockPublicKey,
      tier: SubscriptionTier.Basic,
      expiresAt: Date.now() / 1000 + 1000, // 1000 seconds in future
    };
    mockGetSubscription.mockResolvedValue(mockSubscription);

    const { result } = renderHook(() => useSubscription());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isExpired).toBe(false);
  });

  test("subscribe(tier) calls buildSubscribe, signAndSubmit, and fetchSubscription", async () => {
    const mockPublicKey = "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    const mockSignAndSubmit = jest.fn();
    mockUseWallet.mockReturnValue({
      publicKey: mockPublicKey,
      signAndSubmit: mockSignAndSubmit,
    });

    const mockXdr = "AAAAA...";
    const mockSubscription = {
      scout: mockPublicKey,
      tier: SubscriptionTier.Pro,
      expiresAt: Date.now() / 1000 + 1000,
    };
    mockBuildSubscribe.mockResolvedValue(mockXdr);
    mockGetSubscription.mockResolvedValue(mockSubscription);

    const { result } = renderHook(() => useSubscription());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.subscribe(SubscriptionTier.Pro);
    });

    expect(mockBuildSubscribe).toHaveBeenCalledWith(mockPublicKey, SubscriptionTier.Pro);
    expect(mockSignAndSubmit).toHaveBeenCalledWith(mockXdr);
    expect(mockGetSubscription).toHaveBeenCalledTimes(2);
  });

  test("InsufficientFee error is surfaced in the error state", async () => {
    const mockPublicKey = "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    const mockSignAndSubmit = jest.fn().mockRejectedValue(new Error("InsufficientFee"));
    mockUseWallet.mockReturnValue({
      publicKey: mockPublicKey,
      signAndSubmit: mockSignAndSubmit,
    });

    mockBuildSubscribe.mockResolvedValue("AAAAA...");
    mockGetSubscription.mockResolvedValue(null);

    const { result } = renderHook(() => useSubscription());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await expect(
      act(async () => {
        await result.current.subscribe(SubscriptionTier.Basic);
      })
    ).rejects.toThrow("InsufficientFee");

    expect(result.current.error).toBe("InsufficientFee");
  });
});
