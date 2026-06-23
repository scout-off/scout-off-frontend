import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { checkRateLimit } from "@/lib/rateLimit";

const LIMIT = 10;
const WINDOW_MS = 60_000;

function getIp(req: NextRequest): string {
  return (
    req.ip ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const { allowed, retryAfter } = checkRateLimit(`ipfs:${getIp(req)}`, LIMIT, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const form = await req.formData();
  const file = form.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

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
}
