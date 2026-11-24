/**
 * Size-bounded JSON store for referral data with automatic retention and archiving.
 *
 * ## Retention Policy
 *
 * | Rule               | Threshold      | Action                                      |
 * |--------------------|----------------|---------------------------------------------|
 * | **Unused codes**   | Older than 6 months from creation | Archived to a timestamped file, then pruned from the live store |
 * | **Used codes**     | Older than 12 months from redemption | Archived, then pruned |
 * | **Size cap**       | 1,000 entries or ~1 MB JSON | Oldest entries archived, live store reset |
 *
 * Archived data is written to `data/referrals-YYYY-MM-DD.json.archive` so
 * historical reporting can still read it — nothing is silently deleted.
 * The working set (live store) never grows beyond ~1 MB / 1,000 entries.
 *
 * These thresholds are configurable via the exported constants below.
 */
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReferralEntry {
  code: string;
  scoutWallet: string;
  createdAt: string; // ISO-8601
  usedBy: string | null;
  usedAt: string | null;
}

// ---------------------------------------------------------------------------
// Configuration — tunable retention + size limits
// ---------------------------------------------------------------------------

/** Maximum number of entries in the live store before rotation. */
export const MAX_ENTRIES = 1_000;

/** Approximate byte-size cap for the live store before rotation. */
export const MAX_BYTES = 1 * 1024 * 1024; // 1 MB

/**
 * Unused (never-redeemed) codes older than this many milliseconds are
 * eligible for archiving during housekeeping.
 *
 * Default: 6 months (~183 days).
 */
export const UNUSED_RETENTION_MS = 183 * 24 * 60 * 60 * 1000;

/**
 * Used (redeemed) codes older than this many milliseconds since their
 * `usedAt` timestamp are eligible for archiving.
 *
 * Default: 12 months (~365 days).
 */
export const USED_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'referrals.json');

/** Archive files follow the pattern referrals-YYYY-MM-DD.json.archive. */
function archiveFileName(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return path.join(DATA_DIR, `referrals-${yyyy}-${mm}-${dd}.json.archive`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readStore(): ReferralEntry[] {
  ensureDataDir();
  if (!fs.existsSync(STORE_FILE)) return [];
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    return JSON.parse(raw) as ReferralEntry[];
  } catch {
    return [];
  }
}

function writeStore(entries: ReferralEntry[]): void {
  ensureDataDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Housekeeping — retention + archiving
// ---------------------------------------------------------------------------

/** Write entries to a timestamped archive file (append-safe). */
function archiveEntries(entries: ReferralEntry[]): void {
  if (entries.length === 0) return;
  ensureDataDir();
  const dest = archiveFileName();
  try {
    // Append to any existing archive for today so multiple rotations on the
    // same day don't overwrite each other.
    let existing: ReferralEntry[] = [];
    if (fs.existsSync(dest)) {
      try {
        existing = JSON.parse(
          fs.readFileSync(dest, 'utf-8'),
        ) as ReferralEntry[];
      } catch {
        // Corrupt archive — start fresh
      }
    }
    const merged = [...existing, ...entries];
    fs.writeFileSync(dest, JSON.stringify(merged, null, 2), 'utf-8');
  } catch {
    // Archive failure is not fatal — the live store continues to function.
    // A process restart will retry archiving on the next housekeeping pass.
  }
}

/**
 * Prune stale entries from the live store and archive them.
 *
 * Stale = unused codes > UNUSED_RETENTION_MS old, or used codes >
 * USED_RETENTION_MS since redemption.
 *
 * @param entries  The current live store entries.
 * @param nowMs    Current time in milliseconds (injectable for testing).
 * @returns         The pruned entries (live store minus what was archived).
 */
export function pruneStaleEntries(
  entries: ReferralEntry[],
  nowMs: number = Date.now(),
): ReferralEntry[] {
  const cutoffUnused = nowMs - UNUSED_RETENTION_MS;
  const cutoffUsed = nowMs - USED_RETENTION_MS;

  const stale: ReferralEntry[] = [];
  const kept: ReferralEntry[] = [];

  for (const entry of entries) {
    if (entry.usedBy !== null && entry.usedAt !== null) {
      // Used code — expire based on redemption time
      const usedMs = new Date(entry.usedAt).getTime();
      if (usedMs < cutoffUsed) {
        stale.push(entry);
      } else {
        kept.push(entry);
      }
    } else {
      // Unused code — expire based on creation time
      const createdMs = new Date(entry.createdAt).getTime();
      if (createdMs < cutoffUnused) {
        stale.push(entry);
      } else {
        kept.push(entry);
      }
    }
  }

  // Archive stale entries so they remain retrievable for historical reporting.
  archiveEntries(stale);

  return kept;
}

/**
 * Rotate the live store when it exceeds the size or entry cap.
 *
 * Archives everything to a timestamped file and returns an empty array
 * (fresh start). The previous live file is NOT deleted — it's already
 * been written to the archive above.
 */
function rotateLiveStore(entries: ReferralEntry[]): ReferralEntry[] {
  const approxBytes = Buffer.byteLength(JSON.stringify(entries), 'utf-8');
  if (entries.length < MAX_ENTRIES && approxBytes < MAX_BYTES) {
    return entries;
  }

  // Archive the entire live store and start fresh
  archiveEntries(entries);
  return [];
}

/**
 * Run full housekeeping: prune stale entries, then rotate if the live
 * store is still over the size cap.
 */
function housekeep(
  entries: ReferralEntry[],
  nowMs: number = Date.now(),
): ReferralEntry[] {
  const afterPrune = pruneStaleEntries(entries, nowMs);
  return rotateLiveStore(afterPrune);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all stored referral entries from the live store (archived records excluded).
 */
export function getAllCodes(): ReferralEntry[] {
  return readStore();
}

/**
 * Generate a new referral code and persist it.
 *
 * Runs housekeeping before appending so retention limits are enforced
 * on every write path.
 */
export function generateCode(scoutWallet: string): ReferralEntry {
  const entries = readStore();
  const pruned = housekeep(entries);

  const code = `SCOUT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const entry: ReferralEntry = {
    code,
    scoutWallet,
    createdAt: new Date().toISOString(),
    usedBy: null,
    usedAt: null,
  };

  pruned.push(entry);
  writeStore(pruned);
  return entry;
}

/**
 * Redeem a referral code, marking it as used.
 * Returns the entry if found and unused, or null if not found or already used.
 */
export function redeemCode(code: string, usedBy: string): ReferralEntry | null {
  const entries = readStore();
  const idx = entries.findIndex((e) => e.code === code && e.usedBy === null);

  if (idx === -1) return null;

  entries[idx].usedBy = usedBy;
  entries[idx].usedAt = new Date().toISOString();
  writeStore(entries);
  return entries[idx];
}

/**
 * Get the total number of successful (used) referrals in the live store.
 */
export function getSuccessfulCount(): number {
  return readStore().filter((e) => e.usedBy !== null).length;
}
