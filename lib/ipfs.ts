import axios from 'axios';

const PRIMARY_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs';

/**
 * Default ordered list of fallback IPFS gateways used when the primary gateway
 * returns a 4xx or 5xx response or times out.
 *
 * Exported so consumers and test suites can reference or override the list.
 */
export const DEFAULT_IPFS_FALLBACKS: string[] = [
  'https://ipfs.io/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
];

/** Timeout per gateway attempt in milliseconds. */
const ATTEMPT_TIMEOUT_MS = 8_000;

/**
 * Upload a file to IPFS via the internal API route.
 *
 * @param file - The file to upload.
 * @returns The IPFS CID string assigned by the pinning service.
 */
export async function uploadToIPFS(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);

  const { data } = await axios.post('/api/ipfs/upload', form);
  return data.cid as string;
}

/**
 * Resolve a full URL for an IPFS CID, with automatic gateway fallback.
 *
 * Tries the primary gateway first (`NEXT_PUBLIC_IPFS_GATEWAY`). If the request
 * returns a 4xx or 5xx status, or times out after 8 seconds, it retries with
 * each gateway in `fallbacks` (defaults to {@link DEFAULT_IPFS_FALLBACKS}).
 *
 * A console warning is emitted whenever a fallback gateway is used.
 *
 * @param cid       - The IPFS content identifier to resolve.
 * @param fallbacks - Optional ordered list of fallback gateway base URLs.
 *                    Defaults to {@link DEFAULT_IPFS_FALLBACKS}.
 * @returns The resolved URL string from the first gateway that responds successfully.
 *
 * @throws {Error} When all gateways (primary + all fallbacks) are exhausted without
 *                 a successful response.
 *
 * @example
 * // Basic usage — uses default fallbacks
 * const url = await ipfsUrl("QmXyz...");
 *
 * @example
 * // Custom fallback list
 * const url = await ipfsUrl("QmXyz...", ["https://my-gateway.example.com/ipfs"]);
 */
export async function ipfsUrl(
  cid: string,
  fallbacks: string[] = DEFAULT_IPFS_FALLBACKS,
): Promise<string> {
  const gateways = [PRIMARY_GATEWAY, ...fallbacks];
  
  for (let i = 0; i < gateways.length; i++) {
    const gateway = gateways[i];
    const url = `${gateway}/${cid}`;
    
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        if (i > 0) {
          console.warn(
            `[ipfs] Primary gateway unavailable. Using fallback gateway: ${gateway}`,
          );
        }
        return url;
      } else if (i < gateways.length - 1) {
        console.warn(`Primary gateway failed (${response.status}), falling back to ${gateways[i + 1]}`);
      }

      // 4xx / 5xx — try next gateway
      if (i > 0) {
        console.warn(
          `[ipfs] Gateway ${gateway} returned ${response.status}. Trying next fallback…`,
        );
      }
    } catch {
      clearTimeout(timeoutId);
      if (i > 0) {
        console.warn(
          `[ipfs] Gateway ${gateway} failed (timeout or network error). Trying next fallback…`,
        );
      }
    }
  }

  throw new Error(
    `[ipfs] All gateways exhausted for CID "${cid}". Tried: ${gateways.join(', ')}`,
  );
}
