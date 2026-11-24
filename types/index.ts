// ── Progress ──────────────────────────────────────────────────────────────────
export type ProgressLevel = 0 | 1 | 2 | 3;

// ── Player Stats ──────────────────────────────────────────────────────────────
export interface PlayerStats {
  goals: number;
  assists: number;
  appearances: number;
  clean_sheets?: number;
}

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
  stats?: PlayerStats;
  ipfsHash: string; // Latest highlight reel CID
  progressLevel: ProgressLevel;
  milestones: Milestone[];
  createdAt: number;
  archived?: boolean; // Off-chain archive flag; defaults to false
  backupWallet?: string; // Optional recovery/backup wallet address
  backupWalletVerifiedAt?: number; // Timestamp when backup was verified with primary wallet signature
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

// ── Academy ──────────────────────────────────────────────────────────────────
/**
 * An off-chain grouping of validator wallets under one institutional
 * identity (e.g. a football academy with several coaching staff). This is
 * purely an off-chain overlay — each member wallet must still be
 * individually authorized on-chain via `add_validator` for its milestone
 * approvals to be valid. See docs/academy-validator-model.md.
 */
export interface Academy {
  id: string;
  name: string;
  /** Stellar public key of the wallet that owns/manages this academy record. */
  ownerWallet: string;
  createdAt: number;
  members: AcademyMember[];
}

/** One wallet registered as a signer under an {@link Academy}. */
export interface AcademyMember {
  wallet: string;
  academyId: string;
  addedAt: number;
  /** Stellar public key of the admin who registered this wallet under the academy. */
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
/**
 * Represents a scout's subscription details.
 */
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

// ── Trial Offer ───────────────────────────────────────────────────────────────
export type TrialOfferType = 'trial' | 'loan' | 'transfer';

export interface TrialOfferDetails {
  clubName: string;
  offerType: TrialOfferType;
  message?: string;
}

// ── Referral / Invite ─────────────────────────────────────────────────────────
export interface ReferralCode {
  code: string;
  scoutWallet: string;
  createdAt: number;
  usedBy: string | null;
  usedAt: number | null;
}

export interface ReferralStats {
  totalCodes: number;
  successfulReferrals: number;
}

export interface TopReferrer {
  scoutWallet: string;
  totalCodes: number;
  successfulReferrals: number;
}

export interface ReferralOverview {
  totalCodes: number;
  totalSuccessfulReferrals: number;
  topReferrers: TopReferrer[];
}

// ── Fraud / abuse detection ────────────────────────────────────────────────────
export type FraudFlagCategory = 'referral' | 'pay_to_contact';

export type FraudFlagSeverity = 'low' | 'medium' | 'high';

export interface FraudFlag {
  /** Stable id derived from category + heuristic + subject, so re-runs dedupe. */
  id: string;
  category: FraudFlagCategory;
  /** Which heuristic in lib/fraudDetection.ts produced this flag. */
  heuristic: string;
  severity: FraudFlagSeverity;
  /** Wallet(s) the flag is about, in the order most relevant to the heuristic. */
  wallets: string[];
  /** One-line, human-readable explanation for the admin panel. */
  reason: string;
  /** Structured numbers backing `reason`, shown expanded for investigation. */
  evidence: Record<string, number | string | string[]>;
}

// ── Contract call helpers ─────────────────────────────────────────────────────
export interface ContractCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── Watchlist / Saved Search ────────────────────────────────────────────────
export interface WatchlistEntry {
  id: number;
  scoutWallet: string;
  playerId: string;
  createdAt: number; // Unix ms
}

export interface SavedSearch {
  id: number;
  scoutWallet: string;
  name: string;
  filter: PlayerFilter;
  createdAt: number; // Unix ms
}
