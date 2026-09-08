/**
 * Admin API: IPFS superseded-CID cleanup
 *
 * GET  /api/admin/ipfs-cleanup  — Returns all tracked superseded CID records
 *                                  (for audit). Requires admin auth.
 *
 * POST /api/admin/ipfs-cleanup  — Runs cleanup: unpins every CID that has
 *                                  passed the 72-hour grace period (see
 *                                  lib/supersededMediaStore.ts for grace
 *                                  period rationale). Requires admin auth.
 *
 * ─── No cron infrastructure ────────────────────────────────────────────────
 * This endpoint is intentionally admin-triggerable only. There is currently
 * no scheduled-task / cron infrastructure in this project. Adding automatic
 * periodic execution (e.g. via a Vercel Cron Job, a GitHub Actions schedule,
 * or an external scheduler) is a follow-up task.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * ─── Safety: current-CID guard ─────────────────────────────────────────────
 * The POST body accepts an optional `currentCids` array:
 *   { currentCids?: Array<{ playerId: string; cid: string }> }
 * When provided, any eligible CID that still appears in `currentCids` is
 * skipped and reported under `skipped` in the response. This protects against
 * a scenario where a superseded record was created for a CID that is still
 * the live profile hash (e.g., if the profile was rolled back). If `currentCids`
 * is omitted the guard is bypassed — the caller is responsible for safety.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWallet } from '@/lib/adminAuth';
import {
  getAllRecords,
  getEligibleForUnpin,
  isCidStillReferenced,
  markUnpinned,
} from '@/lib/supersededMediaStore';

function pinataunpinUrl(cid: string): string {
  return `https://api.pinata.cloud/pinning/unpin/${encodeURIComponent(cid)}`;
}

/** Calls Pinata's unpin API for a single CID. Returns null on success, error message on failure. */
async function unpinFromPinata(cid: string): Promise<string | null> {
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_SECRET;

  if (!apiKey || !apiSecret) {
    return 'Pinata credentials not configured (PINATA_API_KEY / PINATA_SECRET missing)';
  }

  try {
    const res = await fetch(pinataunpinUrl(cid), {
      method: 'DELETE',
      headers: {
        pinata_api_key: apiKey,
        pinata_secret_api_key: apiSecret,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return `Pinata responded ${res.status}: ${body}`;
    }

    return null; // success
  } catch (err) {
    return err instanceof Error ? err.message : 'Unknown fetch error';
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ records: getAllRecords() });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export interface CleanupRequestBody {
  /**
   * Optional list of currently-live CIDs per player.
   * Any eligible superseded CID that appears here will be skipped (not unpinned).
   */
  currentCids?: Array<{ playerId: string; cid: string }>;
}

export interface CleanupResponse {
  unpinned: string[];
  skipped: string[];
  errors: Array<{ cid: string; error: string }>;
}

export async function POST(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CleanupRequestBody = {};
  try {
    body = (await req.json().catch(() => ({}))) as CleanupRequestBody;
  } catch {
    // malformed body — treat as empty, which is allowed
  }

  // Build a playerId -> currentCid map from the optional safety payload
  const currentCidsByPlayer = new Map<string, string>();
  if (Array.isArray(body.currentCids)) {
    for (const entry of body.currentCids) {
      if (entry?.playerId && entry?.cid) {
        currentCidsByPlayer.set(entry.playerId, entry.cid);
      }
    }
  }

  const eligible = getEligibleForUnpin();

  const unpinned: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ cid: string; error: string }> = [];

  await Promise.all(
    eligible.map(async (record) => {
      // Safety guard: skip if this CID is still referenced as current
      if (
        currentCidsByPlayer.size > 0 &&
        isCidStillReferenced(record.cid, currentCidsByPlayer)
      ) {
        skipped.push(record.cid);
        return;
      }

      const err = await unpinFromPinata(record.cid);
      if (err) {
        errors.push({ cid: record.cid, error: err });
      } else {
        markUnpinned(record.id);
        unpinned.push(record.cid);
      }
    }),
  );

  const response: CleanupResponse = { unpinned, skipped, errors };
  return NextResponse.json(response);
}
