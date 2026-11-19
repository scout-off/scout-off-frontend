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
 * Before unpinning, every candidate CID is re-checked against the player's
 * current on-chain state (ipfsHash + gallery CIDs) via getPlayer(). Any CID
 * that is still referenced is skipped and reported under `skipped` in the
 * response. This applies to all records, including ones written before the
 * superseded route was hardened, so a stale/forged record can never unpin
 * live media.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { NextRequest } from 'next/server';
import { requireAdminWallet } from '@/lib/adminAuth';
import {
  getAllRecords,
  getEligibleForUnpin,
  markUnpinned,
} from '@/lib/supersededMediaStore';
import { getPlayer } from '@/lib/contract';
import { privateJson } from '@/lib/httpResponses';
import { withTimeoutSignal } from '@/lib/fetchTimeout';

const PINATA_UNPIN_TIMEOUT_MS = 10_000;

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
    return await withTimeoutSignal(PINATA_UNPIN_TIMEOUT_MS, async (signal) => {
      const res = await fetch(pinataunpinUrl(cid), {
        method: 'DELETE',
        headers: {
          pinata_api_key: apiKey,
          pinata_secret_api_key: apiSecret,
        },
        signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return `Pinata responded ${res.status}: ${body}`;
      }

      return null; // success
    });
  } catch (err) {
    return err instanceof Error ? err.message : 'Unknown fetch error';
  }
}

/**
 * Collects every CID currently referenced by a player's on-chain record:
 * the live `ipfsHash` plus any gallery CIDs. Returns an empty set when the
 * player cannot be read (caller treats that as "still referenced" to be safe).
 */
async function getReferencedCids(playerId: string): Promise<Set<string>> {
  const player = await getPlayer(playerId);
  const referenced = new Set<string>();
  if (!player) return referenced;

  if (typeof player.ipfsHash === 'string' && player.ipfsHash) {
    referenced.add(player.ipfsHash);
  }

  const gallery = (player as { galleryCids?: unknown }).galleryCids;
  if (Array.isArray(gallery)) {
    for (const cid of gallery) {
      if (typeof cid === 'string' && cid) referenced.add(cid);
    }
  }

  return referenced;
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  return privateJson({ records: getAllRecords() });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export interface CleanupResponse {
  unpinned: string[];
  skipped: string[];
  errors: Array<{ cid: string; error: string }>;
}

export async function POST(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const eligible = getEligibleForUnpin();

  const unpinned: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ cid: string; error: string }> = [];

  // Cache referenced CIDs per player so we only hit the contract once per player.
  const referencedByPlayer = new Map<string, Set<string>>();

  await Promise.all(
    eligible.map(async (record) => {
      // Safety guard: re-check against current on-chain state before unpinning.
      let referenced = referencedByPlayer.get(record.playerId);
      if (!referenced) {
        try {
          referenced = await getReferencedCids(record.playerId);
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Unknown error';
          console.warn(
            `[ipfs-cleanup] skipping ${record.cid}: failed to read player ${record.playerId} (${reason})`,
          );
          skipped.push(record.cid);
          return;
        }
        referencedByPlayer.set(record.playerId, referenced);
      }

      if (referenced.has(record.cid)) {
        console.warn(
          `[ipfs-cleanup] skipping ${record.cid}: still referenced by player ${record.playerId}`,
        );
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
  return privateJson(response);
}
