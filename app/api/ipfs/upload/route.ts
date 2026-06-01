import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

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
