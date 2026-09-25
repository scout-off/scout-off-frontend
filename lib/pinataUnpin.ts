import axios from 'axios';
import { BACKEND_WRITE_TIMEOUT_MS } from './httpClient';

/**
 * Best-effort unpin of a CID from Pinata (issue #1005's cleanup path).
 * Uses the same PINATA_API_KEY/PINATA_SECRET credentials the pin routes
 * already use (app/api/ipfs/upload/route.ts, lib/pinJson.ts). Never throws
 * — a failed unpin (already unpinned, credentials missing, Pinata
 * unavailable) shouldn't block the rest of a cleanup batch; the caller
 * decides what to do with `ok: false`.
 */
export async function unpinFromPinata(
  cid: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.PINATA_API_KEY;
  const secret = process.env.PINATA_SECRET;
  if (!apiKey || !secret) {
    return { ok: false, error: 'Pinata credentials are not configured' };
  }

  try {
    await axios.delete(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
      headers: {
        pinata_api_key: apiKey,
        pinata_secret_api_key: secret,
      },
      timeout: BACKEND_WRITE_TIMEOUT_MS,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unpin request failed',
    };
  }
}
