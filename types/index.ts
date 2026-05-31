// ── Progress ──────────────────────────────────────────────────────────────────
export type ProgressLevel = 0 | 1 | 2 | 3;

export const PROGRESS_LABELS: Record<ProgressLevel, string> = {
  0: 'Unverified',
  1: 'Verified Identity',
  2: 'Performance Milestones',
  3: 'Elite Tier',
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
  evidenceHash: string; // IPFS CID of supporting media
  validator: string; // Stellar address of approving validator
  timestamp: number; // Unix timestamp from ledger
}

export interface Player {
  id: string;
  wallet: string;
  vitals: PlayerVitals;
  ipfsHash: string; // Latest highlight reel CID
  progressLevel: ProgressLevel;
  milestones: Milestone[];
  createdAt: number;
}

// ── Validator ────────────────────────────────────────────────────────────────────

/**
 * Represents an approved validator's on-chain record as stored in the contract.
 */
export interface ValidatorInfo {
  /** Stellar public key of the validator. */
  address: string;

  /**
   * Unix timestamp (seconds) when this validator was added to the contract.
   * Sourced directly from the ledger close time at the time of the `add_validator`
   * transaction.
   */
  addedAt: number;

  /**
   * Stellar public key of the admin wallet that authorized this validator.
   * Recorded on-chain at the time of the `add_validator` call.
   */
  addedBy: string;
}

// ── Scout ─────────────────────────────────────────────────────────────────────
export type SubscriptionTier = 'basic' | 'pro' | 'elite';

export interface Scout {
  id: string;
  wallet: string;
  name: string;
  organisation: string;
  subscriptionTier: SubscriptionTier;
  subscriptionExpiry: number; // Unix timestamp
  contactedPlayers: string[]; // player IDs
}

// ── Subscription ──────────────────────────────────────────────────────────────
export interface Subscription {
  scout: string; // Stellar address
  tier: SubscriptionTier;
  expiresAt: number; // Unix timestamp
}

// ── Filter ────────────────────────────────────────────────────────────────────
export interface PlayerFilter {
  region?: string;
  position?: string;
  minLevel?: ProgressLevel;
}

// ── Contact Details ───────────────────────────────────────────────────────────
/**
 * Contact information returned after pay-to-contact is unlocked for a player.
 * At least one field must be present. Validation of the requirement is enforced
 * at the contract level to ensure data integrity.
 */
export interface ContactDetails {
  email?: string;
  phone?: string;
  telegram?: string;
}

// ── Contract call helpers ─────────────────────────────────────────────────────
export interface ContractCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
