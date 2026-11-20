import db from './db';
import type { InterestType, SponsorshipSignup } from './types/api';

interface SignupRow {
  id: number;
  email: string;
  interest_type: InterestType;
  created_at: number;
  ip_hash?: string;
}

const insertSignup = db.prepare(
  `INSERT OR IGNORE INTO sponsorship_waitlist (email, interest_type, created_at, ip_hash)
   VALUES (@email, @interestType, @createdAt, @ipHash)`,
);

const findByEmail = db.prepare<[string], SignupRow>(
  `SELECT * FROM sponsorship_waitlist WHERE email = ?`,
);

const getAllSignups = db.prepare<[], SignupRow>(
  `SELECT id, email, interest_type, created_at FROM sponsorship_waitlist
   ORDER BY created_at DESC`,
);

function toSignup(row: SignupRow): SponsorshipSignup {
  return {
    id: row.id,
    email: row.email,
    interestType: row.interest_type,
    createdAt: row.created_at,
  };
}

/**
 * Register a new sponsorship waitlist signup.
 *
 * Email is unique — duplicate submissions are silently ignored (INSERT OR IGNORE).
 *
 * @param createdAt - Unix timestamp in milliseconds
 * @param ipHash - SHA-256 hash of the submitter's IP (for abuse tracking)
 * @returns The created signup record, or null if duplicate
 */
export function addSignup(
  email: string,
  interestType: InterestType,
  createdAt: number,
  ipHash: string,
): SignupRow | null {
  const validTypes: InterestType[] = ['fan', 'investor', 'sponsor'];
  if (!validTypes.includes(interestType)) {
    interestType = 'fan';
  }

  const result = insertSignup.run({
    email: email.trim().toLowerCase(),
    interestType,
    createdAt,
    ipHash,
  });

  if (result.changes === 0) {
    return null; // duplicate email
  }

  return findByEmail.get(email) ?? null;
}

/** Returns all signups (email only — no IP hash). Used by admin tooling. */
export function getAllSignupsSafe(): SponsorshipSignup[] {
  return getAllSignups.all().map(toSignup);
}
