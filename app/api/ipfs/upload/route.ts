import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

/** Allowed top-level MIME type categories */
const ALLOWED_MIME_PREFIXES = ["video/", "image/"];

/**
 * Magic-byte signatures for supported media formats.
 * Each entry: { label, offset, bytes (hex) }
 */
const MAGIC_SIGNATURES: Array<{ label: string; offset: number; hex: string }> = [
  // JPEG: FF D8 FF
  { label: "JPEG", offset: 0, hex: "ffd8ff" },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { label: "PNG", offset: 0, hex: "89504e470d0a1a0a" },
  // GIF87a / GIF89a
  { label: "GIF", offset: 0, hex: "474946383761" },
  { label: "GIF", offset: 0, hex: "474946383961" },
  // WebP: RIFF????WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  { label: "WebP", offset: 0, hex: "52494646" }, // "RIFF" — validated further below
  // MP4: ftyp box at offset 4
  { label: "MP4", offset: 4, hex: "66747970" }, // "ftyp"
  // MOV (QuickTime): ftyp or wide/mdat/moov — check for "ftyp" at offset 4 too
  // Additional MOV magic: 00 00 00 xx 6d 6f 6f 76 ("moov")
  { label: "MOV", offset: 4, hex: "6d6f6f76" }, // "moov"
  // WebM: 1A 45 DF A3
  { label: "WebM", offset: 0, hex: "1a45dfa3" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Returns true if the first 12 bytes match a known media magic signature.
 * For WebP we additionally verify bytes 8-11 equal "WEBP".
 */
function hasValidMagicBytes(header: Uint8Array): boolean {
  const hex = bufToHex(header);

  for (const sig of MAGIC_SIGNATURES) {
    const slice = bufToHex(header.slice(sig.offset, sig.offset + sig.hex.length / 2));
    if (slice === sig.hex) {
      // Extra WebP check: bytes 8-11 must be "WEBP" (57454250)
      if (sig.label === "WebP") {
        const webpMark = bufToHex(header.slice(8, 12));
        return webpMark === "57454250";
      }
      return true;
    }
  }

  // Fallback: allow MP4/MOV variants where ftyp appears at offset 4 with
  // various brand codes (iso4, M4V, etc.) — already covered above via "ftyp".
  void hex; // suppress unused-var lint
  return false;
}

/** Extract a best-effort client IP from request headers. */
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // ── 1. Parse form data ──────────────────────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
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
