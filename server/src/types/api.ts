/**
 * HTTP payload types for the off-chain backend (issue #1713).
 *
 * Single source of truth for request/response shapes shared by this server
 * and the Next.js frontend: `types/index.ts` in the frontend re-exports the
 * response types from here, so the two sides cannot drift silently.
 *
 * Keep this file dependency-free (no imports) so the frontend type-checker
 * can include it without resolving any server-only packages.
 */

export type MilestoneSubmissionStatus = 'pending' | 'approved' | 'rejected';

/**
 * An off-chain milestone claim awaiting a validator's on-chain approval
 * (issues #567, #568). Distinct from the on-chain `Milestone`, which only
 * exists once a validator has already approved one.
 */
export interface MilestoneSubmission {
  id: string;
  playerId: string;
  playerName: string | null;
  description: string;
  evidenceUrl: string | null;
  validatorWallet: string;
  submittedBy: string;
  status: MilestoneSubmissionStatus;
  createdAt: number;
  decidedAt: number | null;
  txHash: string | null;
}

/** One wallet registered as a signer under an {@link Academy}. */
export interface AcademyMember {
  wallet: string;
  academyId: string;
  addedAt: number;
  /** Stellar public key of the admin who registered this wallet under the academy. */
  addedBy: string;
}

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
  /**
   * Optional milestone-approval quorum (issue #1185): the minimum number of
   * this academy's distinct member wallets that must each endorse a
   * milestone before it's shown as "academy-verified" in the UI. `null`
   * (the default) means no quorum is configured — behaves identically to
   * before this feature existed. Purely an off-chain display/workflow
   * setting; never affects on-chain `approve_milestone` authorization,
   * which stays single-signer regardless of this value.
   */
  quorum: number | null;
}

export interface ReferralCode {
  code: string;
  scoutWallet: string;
  createdAt: number;
  usedBy: string | null;
  usedAt: number | null;
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

export type InterestType = 'fan' | 'investor' | 'sponsor';

export interface SponsorshipSignup {
  id: number;
  email: string;
  interestType: InterestType;
  createdAt: number;
}

// ── Request bodies ──────────────────────────────────────────────────────────

export interface CreateAcademyBody {
  name: string;
  ownerWallet: string;
  createdBy: string;
}

export interface AddAcademyMemberBody {
  wallet: string;
  addedBy: string;
}

export interface SetAcademyQuorumBody {
  quorum: number | null;
}

export interface CreateMilestoneSubmissionBody {
  playerId: string;
  playerName?: string;
  description: string;
  evidenceUrl?: string;
  validatorWallet: string;
  submittedBy: string;
}

export interface DecideMilestoneSubmissionBody {
  status: 'approved' | 'rejected';
  txHash?: string;
}

export interface GenerateReferralBody {
  scoutWallet: string;
  turnstileToken?: string;
}

export interface RedeemReferralBody {
  code: string;
  usedBy: string;
}

export interface SponsorshipWaitlistBody {
  email: string;
  interestType?: InterestType;
  turnstileToken?: string;
}

// ── Errors ──────────────────────────────────────────────────────────────────

/** 400 body returned by the validation middleware (issue #1714). */
export interface ValidationErrorBody {
  error: {
    code: 'VALIDATION_FAILED';
    message: string;
    details: { path: string; message: string }[];
  };
}
