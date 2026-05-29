export const DEFAULT_IPFS_FALLBACKS = ['https://ipfs.io/ipfs', 'https://cloudflare-ipfs.com/ipfs'];

const PRIMARY_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs';

/**
 * Default ordered list of fallback IPFS gateways used when the primary gateway
 * returns a 4xx or 5xx response or times out.
 *
 * Exported so consumers and test suites can reference or override the list.
 */
export const DEFAULT_IPFS_FALLBACKS: string[] = [
  "https://ipfs.io/ipfs",
  "https://cloudflare-ipfs.com/ipfs",
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

  const response = await fetch('/api/ipfs/upload', {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.cid as string;
}

export async function ipfsUrl(cid: string, fallbacks: string[] = DEFAULT_IPFS_FALLBACKS): Promise<string> {
  const gateways = [PRIMARY_GATEWAY, ...fallbacks];
  
  for (let i = 0; i < gateways.length; i++) {
    const gateway = gateways[i];
    const url = `${gateway}/${cid}`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(url, { 
        method: 'HEAD', 
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return url;
      } else if (i < gateways.length - 1) {
        console.warn(`Primary gateway failed (${response.status}), falling back to ${gateways[i + 1]}`);
      }
    } catch (error) {
      if (i < gateways.length - 1) {
        console.warn(`Gateway request failed, falling back to ${gateways[i + 1]}`, error);
      }
    }
  }
  
  throw new Error('All IPFS gateways exhausted');
}
