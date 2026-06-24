import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { sanitize } from '@/lib/sanitize';

/**
 * POST /api/ipfs/upload
 *
 * Rate limiting: max 10 uploads per IP per 60 seconds.
 * When exceeded, responds with 429 Too Many Requests and Retry-After header.
 *
 * Real client IP is extracted from the x-forwarded-for header.
 */
const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 1000;

/** Maximum accepted file size: 100 MB */
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/** Accepted MIME type prefixes */
const ALLOWED_MIME_PREFIXES = ['image/', 'video/'];

/** Convert a Uint8Array to a lowercase hex string for logging */
function bufToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validate file magic bytes against known image/video signatures.
 * Accepts JPEG, PNG, GIF, WebP, AVIF, MP4/MOV, WebM, MKV, AVI, MKV.
 */
function hasValidMagicBytes(header: Uint8Array): boolean {
  // JPEG: FF D8 FF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff)
    return true;
  // PNG: 89 50 4E 47
  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  )
    return true;
  // GIF: 47 49 46 38
  if (
    header[0] === 0x47 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x38
  )
    return true;
  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  )
    return true;
  // MP4/MOV/M4V ftyp box: bytes 4-7 = 66 74 79 70
  if (
    header[4] === 0x66 &&
    header[5] === 0x74 &&
    header[6] === 0x79 &&
    header[7] === 0x70
  )
    return true;
  // WebM/MKV: 1A 45 DF A3
  if (
    header[0] === 0x1a &&
    header[1] === 0x45 &&
    header[2] === 0xdf &&
    header[3] === 0xa3
  )
    return true;
  // AVI: 52 49 46 46 ?? ?? ?? ?? 41 56 49 20
  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x41 &&
    header[9] === 0x56 &&
    header[10] === 0x49
  )
    return true;
  return false;
}

type RateEntry = { count: number; firstSeen: number };
const ipRateMap = new Map<string, RateEntry>();

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

function checkRateLimit(ip: string): {
  limited: boolean;
  retryAfterSec?: number;
} {
  const now = Date.now();
  const entry = ipRateMap.get(ip);
  if (!entry) {
    ipRateMap.set(ip, { count: 1, firstSeen: now });
    return { limited: false };
  }

  if (now - entry.firstSeen > WINDOW_MS) {
    ipRateMap.set(ip, { count: 1, firstSeen: now });
    return { limited: false };
  }

  entry.count += 1;
  ipRateMap.set(ip, entry);

  if (entry.count > RATE_LIMIT) {
    const retryAfterSec = Math.ceil(
      (WINDOW_MS - (now - entry.firstSeen)) / 1000,
    );
    return { limited: true, retryAfterSec };
  }

  return { limited: false };
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // Rate limiting check
  const rl = checkRateLimit(ip);
  if (rl.limited) {
    console.warn(`[IPFS rate limit] Too many uploads from IP: ${ip}`);
    const retryAfter = rl.retryAfterSec ?? 60;
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // ── 1. Parse form data ──────────────────────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  // Server-side sanitization: strip HTML tags from any text fields that may be present
  try {
    for (const [key, value] of Array.from(form.entries())) {
      if (typeof value === 'string') {
        // overwrite with stripped value
        form.set(key, sanitize(value));
      }
    }
  } catch (e) {
    // If FormData.set isn't available in this environment, ignore — sanitization is best-effort here
  }

  const file = form.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // ── 2. Size check (issue #119) ──────────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE_BYTES) {
    console.warn(
      `[IPFS upload] Rejected oversized file: size=${file.size} type=${file.type} ip=${ip}`,
    );
    return NextResponse.json(
      {
        error: `File exceeds the 100 MB size limit (received ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
      },
      { status: 400 },
    );
  }

  // ── 3. MIME type check (issue #119) ────────────────────────────────────────
  const mimeType = file.type.toLowerCase();
  const mimeAllowed = ALLOWED_MIME_PREFIXES.some((prefix) =>
    mimeType.startsWith(prefix),
  );
  if (!mimeAllowed) {
    console.warn(
      `[IPFS upload] Rejected disallowed MIME type: type=${file.type} size=${file.size} ip=${ip}`,
    );
    return NextResponse.json(
      {
        error: `File type "${file.type}" is not allowed. Only image/* and video/* files are accepted.`,
      },
      { status: 400 },
    );
  }

  // ── 4. Magic-byte check (issue #119) ───────────────────────────────────────
  // Read only the first 12 bytes to verify the actual file format.
  const headerSlice = file.slice(0, 12);
  const headerBuffer = new Uint8Array(await headerSlice.arrayBuffer());

  if (!hasValidMagicBytes(headerBuffer)) {
    console.warn(
      `[IPFS upload] Rejected spoofed MIME type: type=${file.type} size=${file.size} ip=${ip} header=${bufToHex(headerBuffer)}`,
    );
    return NextResponse.json(
      {
        error:
          'File content does not match its declared type. Upload rejected.',
      },
      { status: 400 },
    );
  }

  // ── 5. Forward to Pinata ────────────────────────────────────────────────────
  try {
    const pinataForm = new FormData();
    pinataForm.append('file', file);

    const { data } = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      pinataForm,
      {
        headers: {
          pinata_api_key: process.env.PINATA_API_KEY!,
          pinata_secret_api_key: process.env.PINATA_SECRET!,
        },
      },
    );

    return NextResponse.json({ cid: data.IpfsHash });
  } catch (err) {
    console.error(`[IPFS upload] Pinata error: ip=${ip}`, err);
    return NextResponse.json(
      { error: 'Failed to upload file to IPFS' },
      { status: 502 },
    );
  }
}
