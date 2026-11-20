import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// Public env vars the app needs at module scope (lib/stellar.ts constructs the
// Soroban server eagerly, so SSR of the navbar fails without these). Values are
// public testnet endpoints + a dummy valid-format contract id — no secrets.
const webServerEnv = {
  NEXT_PUBLIC_CONTRACT_ID:
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4",
  NEXT_PUBLIC_NETWORK: "testnet",
  NEXT_PUBLIC_HORIZON_URL: "https://horizon-testnet.stellar.org",
  NEXT_PUBLIC_SOROBAN_RPC: "https://soroban-testnet.stellar.org",
  NEXT_PUBLIC_IPFS_GATEWAY: "https://gateway.pinata.cloud/ipfs",
  NEXT_PUBLIC_API_URL: "http://localhost:4000",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: webServerEnv,
  },
});
