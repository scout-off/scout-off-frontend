const path = require("path");
const { spawnSync } = require("child_process");

const scriptPath = path.join(__dirname, "../../scripts/validate-env.js");
const requiredEnv = {
  NEXT_PUBLIC_CONTRACT_ID: "contract-id",
  NEXT_PUBLIC_NETWORK: "testnet",
  NEXT_PUBLIC_HORIZON_URL: "https://horizon-testnet.stellar.org",
  NEXT_PUBLIC_SOROBAN_RPC: "https://soroban-testnet.stellar.org",
  PINATA_API_KEY: "pinata-key",
  PINATA_SECRET: "pinata-secret",
  NEXT_PUBLIC_IPFS_GATEWAY: "https://gateway.pinata.cloud/ipfs",
  NEXT_PUBLIC_API_URL: "http://localhost:4000",
  PLATFORM_CONTACT_FEE_XLM: "1",
};

function runValidateEnv(envOverrides) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: path.join(__dirname, "../.."),
    env: {
      PATH: process.env.PATH,
      ...envOverrides,
    },
    encoding: "utf8",
  });
}

describe("scripts/validate-env.js", () => {
  it("exits with code 0 when all variables in .env.example are present", () => {
    const result = runValidateEnv(requiredEnv);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("All 9 env vars from .env.example are present");
  });

  it("exits with code 1 when any variable is missing", () => {
    const { PINATA_API_KEY, PINATA_SECRET, ...envWithoutPinata } = requiredEnv;

    const result = runValidateEnv(envWithoutPinata);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("PINATA_API_KEY");
    expect(result.stdout).toContain("PINATA_SECRET");
  });

  it("prints each missing variable to stdout", () => {
    const { NEXT_PUBLIC_API_URL, PLATFORM_CONTACT_FEE_XLM, ...partialEnv } = requiredEnv;

    const result = runValidateEnv(partialEnv);

    expect(result.stdout).toContain("NEXT_PUBLIC_API_URL");
    expect(result.stdout).toContain("PLATFORM_CONTACT_FEE_XLM");
    expect(result.stderr).toBe("");
  });
});
