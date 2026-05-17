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
