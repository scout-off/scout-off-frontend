import crypto from 'crypto';
import axios from 'axios';

/**
 * Post-upload integrity verification for IPFS uploads (issue #699).
 *
 * Server-only: uses Node's `crypto` module. Never import this from a client
 * component.
 *
 * Why server-side rather than client-side: the alternative design is having
 * the browser hash the file before upload, then re-fetch the CID from the
 * gateway itself and compare. That doubles the client's bandwidth for every
 * upload (re-downloading a file that can be up to 100MB, over the same
 * low-bandwidth mobile connections app/api/ipfs/upload/complete's chunking
 * exists to be gentle with — see docs/chunked-video-upload.md), and adds
 * client-side crypto plumbing for no real benefit: this app's server already
 * holds the exact bytes it just handed to Pinata, so it can hash and re-fetch
 * without any extra load on the user's connection. The tradeoff is that this
 * verification's network hop (datacenter -> gateway) runs before the route
 * responds, adding to the request's latency — acceptable here since it's a
 * single small request to a gateway that's typically the same provider that
 * just pinned the content (fast, no public-DHT propagation wait), not
 * multiplied by the file's full size the way a client-side re-download would
 * be.
 *
 * This intentionally does NOT attempt to recompute the CID itself and
 * compare it to Pinata's response: a CIDv0 (the default `pinFileToIPFS`
 * returns) is a hash of a UnixFS DAG-PB-wrapped structure, not a plain
 * sha256 of the raw file bytes, so reproducing it exactly would mean
 * reimplementing IPFS's chunking/DAG format here just to match Pinata's
 * implementation. Instead, this re-fetches the CID from the gateway and
 * hashes *that* against a hash of the bytes we uploaded — which directly
 * checks the thing that actually matters: "is what's retrievable via this
 * CID identical to what we sent," regardless of CID format.
 */

const GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs';

/** Generous but bounded — a hung gateway shouldn't hang the whole upload request. */
const VERIFY_TIMEOUT_MS = 15_000;

export class UploadVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadVerificationError';
  }
}

// The `new Uint8Array(bytes)` copy (rather than hashing `bytes` directly)
// sidesteps a @types/node-vs-DOM-lib generic mismatch — under this project's
// `lib: ["dom", ...]` tsconfig, `Buffer` (backed by `ArrayBufferLike`, which
// includes `SharedArrayBuffer`) doesn't structurally satisfy the
// `Uint8Array<ArrayBuffer>` that `crypto.BinaryLike` expects. Same fix
// app/api/ipfs/upload/complete/route.ts already uses when constructing a
// `File` from a `Buffer`.
export function sha256Hex(bytes: Buffer): string {
  return crypto
    .createHash('sha256')
    .update(new Uint8Array(bytes))
    .digest('hex');
}

/**
 * Re-fetches `cid` from the configured IPFS gateway and confirms the bytes
 * served back are byte-identical (by sha256) to `uploadedBytes` — the bytes
 * this server actually sent to Pinata. Throws {@link UploadVerificationError}
 * (with a message safe to surface to the end user) when the gateway can't be
 * reached or the content doesn't match, so a caller can treat the upload as
 * failed-but-retryable instead of returning a CID that may not resolve to
 * the right content.
 */
export async function verifyUploadedContent(
  cid: string,
  uploadedBytes: Buffer,
): Promise<void> {
  const expectedHash = sha256Hex(uploadedBytes);

  let fetchedBytes: Buffer;
  try {
    const response = await axios.get<ArrayBuffer>(`${GATEWAY}/${cid}`, {
      responseType: 'arraybuffer',
      timeout: VERIFY_TIMEOUT_MS,
    });
    fetchedBytes = Buffer.from(response.data);
  } catch {
    throw new UploadVerificationError(
      'Could not verify the upload against the IPFS gateway. Please try again.',
    );
  }

  const actualHash = sha256Hex(fetchedBytes);
  if (actualHash !== expectedHash) {
    throw new UploadVerificationError(
      'Uploaded file failed integrity verification. Please try again.',
    );
  }
}
