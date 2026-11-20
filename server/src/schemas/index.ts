import { z } from 'zod';
import type {
  AddAcademyMemberBody,
  CreateAcademyBody,
  CreateMilestoneSubmissionBody,
  DecideMilestoneSubmissionBody,
  GenerateReferralBody,
  RedeemReferralBody,
  SetAcademyQuorumBody,
  SponsorshipWaitlistBody,
} from '../types/api';
import { id, stellarAddress, text, walletParams } from './common';

/**
 * Request schemas for every route (issue #1714). Write-route bodies are
 * `.strict()` so unknown properties are rejected; each schema is checked
 * against the shared payload type in ../types/api.ts.
 */

export { walletParams };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const email = z
  .string()
  .trim()
  .max(254)
  .regex(EMAIL_RE, 'must be a valid email address');

const turnstileToken = z.string().max(2048).optional();

// ── Academies ───────────────────────────────────────────────────────────────

export const academyIdParams = z.object({ id });
export const academyMemberParams = z.object({ id, wallet: stellarAddress });

export const createAcademyBody = z
  .object({
    name: text(120),
    ownerWallet: stellarAddress,
    createdBy: stellarAddress,
  })
  .strict() satisfies z.ZodType<CreateAcademyBody>;

export const addAcademyMemberBody = z
  .object({ wallet: stellarAddress, addedBy: stellarAddress })
  .strict() satisfies z.ZodType<AddAcademyMemberBody>;

/** Upper bound (quorum ≤ member count) is checked by setAcademyQuorum. */
export const setAcademyQuorumBody = z
  .object({ quorum: z.number().int().min(1).nullable() })
  .strict() satisfies z.ZodType<SetAcademyQuorumBody>;

// ── Milestone submissions ───────────────────────────────────────────────────

export const submissionIdParams = z.object({ id });

export const createMilestoneSubmissionBody = z
  .object({
    playerId: text(128),
    playerName: text(120).optional(),
    description: text(1000),
    evidenceUrl: z.string().trim().url().max(2048).optional(),
    validatorWallet: stellarAddress,
    submittedBy: stellarAddress,
  })
  .strict() satisfies z.ZodType<CreateMilestoneSubmissionBody>;

export const listSubmissionsQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
});

export const decideMilestoneSubmissionBody = z
  .object({
    status: z.enum(['approved', 'rejected']),
    txHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/i, 'must be a 64-character hex hash')
      .optional(),
  })
  .strict() satisfies z.ZodType<DecideMilestoneSubmissionBody>;

// ── Referrals ───────────────────────────────────────────────────────────────

export const generateReferralBody = z
  .object({ scoutWallet: stellarAddress, turnstileToken })
  .strict() satisfies z.ZodType<GenerateReferralBody>;

export const redeemReferralBody = z
  .object({ code: text(32), usedBy: stellarAddress })
  .strict() satisfies z.ZodType<RedeemReferralBody>;

// ── Sponsorship ─────────────────────────────────────────────────────────────

export const sponsorshipWaitlistBody = z
  .object({
    email,
    interestType: z.enum(['fan', 'investor', 'sponsor']).optional(),
    turnstileToken,
  })
  .strict() satisfies z.ZodType<SponsorshipWaitlistBody>;

// ── Users (service-authenticated) ───────────────────────────────────────────

export const waitlistEmailQuery = z.object({ email });
export const waitlistEmailBody = z.object({ email }).strict();
