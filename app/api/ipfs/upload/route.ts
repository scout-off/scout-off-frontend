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

type RateEntry = { count: number; firstSeen: number };
const ipRateMap = new Map<string, RateEntry>();

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

function checkRateLimit(ip: string): { limited: boolean; retryAfterSec?: number } {
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
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - entry.firstSeen)) / 1000);
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
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  // ── 1. Parse form data ──────────────────────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
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

  const file = form.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // ── 2. Size check (issue #119) ──────────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE_BYTES) {
    console.warn(
      `[IPFS upload] Rejected oversized file: size=${file.size} type=${file.type} ip=${ip}`
    );
    return NextResponse.json(
      { error: `File exceeds the 100 MB size limit (received ${(file.size / 1024 / 1024).toFixed(1)} MB)` },
      { status: 400 }
    );
  }

  // ── 3. MIME type check (issue #119) ────────────────────────────────────────
  const mimeType = file.type.toLowerCase();
  const mimeAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
  if (!mimeAllowed) {
    console.warn(
      `[IPFS upload] Rejected disallowed MIME type: type=${file.type} size=${file.size} ip=${ip}`
    );
    return NextResponse.json(
      { error: `File type "${file.type}" is not allowed. Only image/* and video/* files are accepted.` },
      { status: 400 }
    );
  }

  // ── 4. Magic-byte check (issue #119) ───────────────────────────────────────
  // Read only the first 12 bytes to verify the actual file format.
  const headerSlice = file.slice(0, 12);
  const headerBuffer = new Uint8Array(await headerSlice.arrayBuffer());

  if (!hasValidMagicBytes(headerBuffer)) {
    console.warn(
      `[IPFS upload] Rejected spoofed MIME type: type=${file.type} size=${file.size} ip=${ip} header=${bufToHex(headerBuffer)}`
    );
    return NextResponse.json(
      { error: "File content does not match its declared type. Upload rejected." },
      { status: 400 }
    );
  }

  // ── 5. Forward to Pinata ────────────────────────────────────────────────────
  try {
    const pinataForm = new FormData();
    pinataForm.append("file", file);

    const { data } = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      pinataForm,
      {
        headers: {
          pinata_api_key: process.env.PINATA_API_KEY!,
          pinata_secret_api_key: process.env.PINATA_SECRET!,
        },
      }
    );

    return NextResponse.json({ cid: data.IpfsHash });
  } catch (err) {
    console.error(`[IPFS upload] Pinata error: ip=${ip}`, err);
    return NextResponse.json({ error: "Failed to upload file to IPFS" }, { status: 502 });
  }
}
