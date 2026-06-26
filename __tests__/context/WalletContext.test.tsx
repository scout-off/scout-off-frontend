import { renderHook, act, waitFor } from "@testing-library/react";
import { WalletProvider, useWalletContext } from "@/context/WalletContext";
import { walletAdapters } from "@/lib/walletAdapters";
import type { ReactNode } from "react";

jest.mock("@/lib/walletAdapters", () => ({
  walletAdapters: {
    freighter: {
      getPublicKey: jest.fn(),
      signTransaction: jest.fn(),
    },
    albedo: {
      getPublicKey: jest.fn(),
      signTransaction: jest.fn(),
    },
    lobstr: {
      getPublicKey: jest.fn(),
      signTransaction: jest.fn(),
    },
  },
}));

jest.mock("@/lib/stellar", () => ({
  rpc: { sendTransaction: jest.fn(), getAccount: jest.fn() },
  NETWORK: "Test SDF Network ; September 2015",
}));

jest.mock("@stellar/stellar-sdk", () => ({
  TransactionBuilder: { fromXDR: jest.fn(() => ({})) },
}));

const PUBLIC_KEY = "GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV";
const CHALLENGE_XDR = "challenge-xdr";
const SIGNED_XDR = "signed-xdr";

const mockFetch = jest.fn();
global.fetch = mockFetch;

function wrapper({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}

function setupSep10() {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ transaction: CHALLENGE_XDR }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "jwt-token" }),
    });
}

describe("WalletContext", () => {
  const freighter = walletAdapters.freighter as jest.Mocked<typeof walletAdapters.freighter>;
  const albedo = walletAdapters.albedo as jest.Mocked<typeof walletAdapters.albedo>;
  const lobstr = walletAdapters.lobstr as jest.Mocked<typeof walletAdapters.lobstr>;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    freighter.getPublicKey.mockResolvedValue(PUBLIC_KEY);
    freighter.signTransaction.mockResolvedValue(SIGNED_XDR);
    albedo.getPublicKey.mockResolvedValue(PUBLIC_KEY);
    albedo.signTransaction.mockResolvedValue(SIGNED_XDR);
    lobstr.getPublicKey.mockResolvedValue(PUBLIC_KEY);
    lobstr.signTransaction.mockResolvedValue(SIGNED_XDR);

    const { rpc } = jest.requireMock("@/lib/stellar");
    rpc.getAccount.mockResolvedValue({
      balances: [{ asset_type: "native", balance: "100.0000000" }],
    });
  });

  describe("connectWithProvider", () => {
    it("calls freighter adapter and completes SEP-10 flow", async () => {
      setupSep10();
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => { await result.current.connectWithProvider("freighter"); });
      expect(freighter.getPublicKey).toHaveBeenCalled();
      expect(freighter.signTransaction).toHaveBeenCalledWith(CHALLENGE_XDR, expect.any(String));
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.publicKey).toBe(PUBLIC_KEY);
    });

    it("calls albedo adapter for albedo provider", async () => {
      setupSep10();
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => { await result.current.connectWithProvider("albedo"); });
      expect(albedo.getPublicKey).toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(true);
    });

    it("calls lobstr adapter for lobstr provider", async () => {
      setupSep10();
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => { await result.current.connectWithProvider("lobstr"); });
      expect(lobstr.getPublicKey).toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(true);
    });

    it("sets isAuthenticated to true on success", async () => {
      setupSep10();
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      expect(result.current.isAuthenticated).toBe(false);
      await act(async () => { await result.current.connectWithProvider("freighter"); });
      expect(result.current.isAuthenticated).toBe(true);
    });

    it("throws and does not set isAuthenticated on adapter failure", async () => {
      freighter.getPublicKey.mockRejectedValue(new Error("Freighter not installed"));
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await expect(
        act(async () => { await result.current.connectWithProvider("freighter"); })
      ).rejects.toThrow("Freighter not installed");
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("calls loadBalance after successful connect", async () => {
      setupSep10();
      const { rpc } = jest.requireMock("@/lib/stellar");
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => { await result.current.connectWithProvider("freighter"); });
      expect(rpc.getAccount).toHaveBeenCalledWith(PUBLIC_KEY);
      await waitFor(() => expect(result.current.xlmBalance).toBe("100.0000000"));
    });
  });

  describe("disconnect", () => {
    it("clears publicKey, isAuthenticated, xlmBalance, walletProvider, and localStorage", async () => {
      setupSep10();
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => { await result.current.connectWithProvider("freighter"); });
      expect(result.current.isAuthenticated).toBe(true);

      act(() => { result.current.disconnect(); });

      expect(result.current.publicKey).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.xlmBalance).toBeNull();
      expect(result.current.walletProvider).toBeNull();
      expect(localStorage.getItem("wallet_session")).toBeNull();
    });
  });

  describe("signAndSubmit", () => {
    it("throws when no wallet is connected", async () => {
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await expect(
        act(async () => { await result.current.signAndSubmit("some-xdr"); })
      ).rejects.toThrow("Wallet not connected");
    });

    it("calls the correct adapter and submits to RPC", async () => {
      setupSep10();
      const { rpc } = jest.requireMock("@/lib/stellar");
      rpc.sendTransaction.mockResolvedValue({ hash: "tx-hash" });
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => { await result.current.connectWithProvider("freighter"); });

      await act(async () => { await result.current.signAndSubmit("tx-xdr"); });

      expect(freighter.signTransaction).toHaveBeenCalledWith("tx-xdr", expect.any(String));
      expect(rpc.sendTransaction).toHaveBeenCalled();
    });
  });
});
