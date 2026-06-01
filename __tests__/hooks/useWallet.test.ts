"use client";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { WalletProvider, useWalletContext as useWallet } from "@/context/WalletContext";

// Mock @stellar/freighter-api
jest.mock("@stellar/freighter-api", () => ({
  getPublicKey: jest.fn(),
  isConnected: jest.fn(),
  signTransaction: jest.fn(),
}));

// Mock @stellar/stellar-sdk
jest.mock("@stellar/stellar-sdk", () => {
  const original = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...original,
    TransactionBuilder: {
      fromXDR: jest.fn().mockReturnValue({}),
    },
  };
});

// Mock @/lib/stellar
jest.mock("@/lib/stellar", () => ({
  rpc: {
    sendTransaction: jest.fn(),
  },
  NETWORK: "Test SDF Network ; September 2015",
}));

import { getPublicKey, isConnected, signTransaction } from "@stellar/freighter-api";
import { rpc } from "@/lib/stellar";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <WalletProvider>{children}</WalletProvider>
);

describe("useWallet", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (global.fetch as jest.Mock) = jest.fn();
  });

  test("session is restored from /api/auth/session on mount", async () => {
    const mockPublicKey = "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ publicKey: mockPublicKey }),
    });

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/session");
    expect(result.current.publicKey).toBe(mockPublicKey);
    expect(result.current.isAuthenticated).toBe(true);
  });

  test("connect() sets wallet address on successful authentication", async () => {
    const mockPublicKey = "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    const mockChallengeXdr = "AAAAA...";
    const mockSignedXdr = "BBBBB...";

    (isConnected as jest.Mock).mockResolvedValue(true);
    (getPublicKey as jest.Mock).mockResolvedValue(mockPublicKey);
    (signTransaction as jest.Mock).mockResolvedValue(mockSignedXdr);

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transaction: mockChallengeXdr }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).toBe(mockPublicKey);
    expect(result.current.isAuthenticated).toBe(true);
  });

  test("connect() throws error when Freighter is not installed", async () => {
    (isConnected as jest.Mock).mockResolvedValue(false);

    const { result } = renderHook(() => useWallet(), { wrapper });

    await expect(act(async () => result.current.connect())).rejects.toThrow(
      "Freighter not installed"
    );

    expect(result.current.publicKey).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test("disconnect() clears wallet address", async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    // First connect to set some state
    (isConnected as jest.Mock).mockResolvedValue(true);
    (getPublicKey as jest.Mock).mockResolvedValue("GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890");
    (signTransaction as jest.Mock).mockResolvedValue("signed");
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transaction: "challenge" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).not.toBeNull();

    // Now disconnect
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.publicKey).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
