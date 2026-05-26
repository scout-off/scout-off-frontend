// ── Progress ──────────────────────────────────────────────────────────────────
export type ProgressLevel = 0 | 1 | 2 | 3;

export const PROGRESS_LABELS: Record<ProgressLevel, string> = {
  0: "Unverified",
  1: "Verified Identity",
  2: "Performance Milestones",
  3: "Elite Tier",
};

// ── Player ────────────────────────────────────────────────────────────────────
export interface PlayerVitals {
  name: string;
  age: number;
  position: string;
  region: string;
  nationality: string;
}

export interface Milestone {
  id: string;
  description: string;
  evidenceHash: string;   // IPFS CID of supporting media
  validator: string;      // Stellar address of approving validator
  timestamp: number;      // Unix timestamp from ledger
}

export interface Player {
  id: string;
  wallet: string;
  vitals: PlayerVitals;
  ipfsHash: string;       // Latest highlight reel CID
  progressLevel: ProgressLevel;
  milestones: Milestone[];
  createdAt: number;
}

// ── Scout ─────────────────────────────────────────────────────────────────────
export type SubscriptionTier = "basic" | "pro" | "elite";

export interface Scout {
  id: string;
  wallet: string;
  name: string;
  organisation: string;
  subscriptionTier: SubscriptionTier;
  subscriptionExpiry: number;   // Unix timestamp
  contactedPlayers: string[];   // player IDs
}

// ── Filter ────────────────────────────────────────────────────────────────────
export interface PlayerFilter {
  region?: string;
  position?: string;
  minLevel?: ProgressLevel;
}

// ── Contract call helpers ─────────────────────────────────────────────────────
export interface ContractCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── Contract errors ──────────────────────────────────────────────────────────
export interface ContractError {
  code: number;
  message: string;
}

export const CONTRACT_ERRORS: Record<number, string> = {
  1: "AlreadyInitialized",
  2: "NotInitialized",
  3: "PlayerNotFound",
  4: "UnauthorizedValidator",
  5: "InvalidMilestone",
  6: "AlreadyAtLevel",
  7: "InsufficientFee",
  8: "SubscriptionExpired",
  9: "ContractPaused",
  10: "Unauthorized",
  11: "NoFeesToWithdraw",
  12: "Overflow",
};

export function isContractError(e: unknown): e is ContractError {
  if (typeof e !== "object" || e === null) {
    return false;
  }

  const maybe = e as { code?: unknown; message?: unknown };

  return (
    typeof maybe.code === "number" &&
    Number.isFinite(maybe.code) &&
    typeof maybe.message === "string"
  );
}
