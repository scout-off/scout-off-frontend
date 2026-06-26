import {
  getPublicKey as freighterGetPublicKey,
  isConnected as freighterIsConnected,
  signTransaction as freighterSign,
} from "@stellar/freighter-api";

export type WalletProvider = "freighter" | "albedo" | "lobstr";

export const walletAdapters: Record<
  WalletProvider,
  {
    getPublicKey(): Promise<string>;
    signTransaction(xdr: string, networkPassphrase: string): Promise<string>;
  }
> = {
  freighter: {
    async getPublicKey() {
      if (!(await freighterIsConnected())) throw new Error("Freighter not installed");
      return freighterGetPublicKey();
    },
    async signTransaction(xdr, networkPassphrase) {
      return freighterSign(xdr, { networkPassphrase });
    },
  },
  albedo: {
    async getPublicKey() {
      throw new Error("Albedo adapter not configured");
    },
    async signTransaction(_xdr, _networkPassphrase) {
      throw new Error("Albedo adapter not configured");
    },
  },
  lobstr: {
    async getPublicKey() {
      throw new Error("LOBSTR adapter not configured");
    },
    async signTransaction(_xdr, _networkPassphrase) {
      throw new Error("LOBSTR adapter not configured");
    },
  },
};
