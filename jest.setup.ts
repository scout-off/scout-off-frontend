import "@testing-library/jest-dom";

// Set up environment variables for tests
process.env.NEXT_PUBLIC_SOROBAN_RPC =
  process.env.NEXT_PUBLIC_SOROBAN_RPC || "https://soroban-testnet.stellar.org";
process.env.NEXT_PUBLIC_NETWORK = process.env.NEXT_PUBLIC_NETWORK || "testnet";
process.env.NEXT_PUBLIC_IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io/ipfs";
process.env.NEXT_PUBLIC_CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONTRACT_ID || "CBQHNAXSI55GX2AKMXF33CKVJQSDACITKZ7WQNXASDQ2SLNYY3DPB75K";
