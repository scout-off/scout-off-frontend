const db = require('./db');

const insertSignup = db.prepare(
  `INSERT OR IGNORE INTO sponsorship_waitlist (email, interest_type, created_at, ip_hash)
   VALUES (@email, @interestType, @createdAt, @ipHash)`,
);

const findByEmail = db.prepare(
  `SELECT * FROM sponsorship_waitlist WHERE email = ?`,
);

const getAllSignups = db.prepare(
  `SELECT id, email, interest_type, created_at FROM sponsorship_waitlist
   ORDER BY created_at DESC`,
);

function toSignup(row) {
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
 * @param {string} email
 * @param {'fan' | 'investor' | 'sponsor'} interestType
 * @param {number} createdAt - Unix timestamp in milliseconds
 * @param {string} ipHash - SHA-256 hash of the submitter's IP (for abuse tracking)
 * @returns {object|null} The created signup record, or null if duplicate
 */
function addSignup(email, interestType, createdAt, ipHash) {
  const validTypes = ['fan', 'investor', 'sponsor'];
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

  return findByEmail.get(email);
}

/** Returns all signups (email only — no IP hash). Used by admin tooling. */
function getAllSignupsSafe() {
  return getAllSignups.all().map(toSignup);
}

module.exports = { addSignup, getAllSignupsSafe };
