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

  return NextResponse.json({ cid: data.IpfsHash });
}
