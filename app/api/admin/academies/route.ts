import { NextRequest, NextResponse } from 'next/server';
import api from '@/lib/api';
import { requireAdminWallet } from '@/lib/adminAuth';
import { sanitizeTextInput } from '@/lib/inputValidation';

// Academy name is a short label — cap at 100 characters.
const ACADEMY_NAME_MAX = 100;

export async function GET(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const academies = await api.get('/academies').then((r) => r.data);
  return NextResponse.json(academies);
}

export async function POST(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, ownerWallet } = await req.json().catch(() => ({}));
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    typeof ownerWallet !== 'string' ||
    !ownerWallet.trim()
  ) {
    return NextResponse.json(
      { error: 'name and ownerWallet are required' },
      { status: 400 },
    );
  }

  const sanitizedName = sanitizeTextInput(name);
  if (sanitizedName.length > ACADEMY_NAME_MAX) {
    return NextResponse.json(
      { error: `name must be at most ${ACADEMY_NAME_MAX} characters` },
      { status: 400 },
    );
  }

  try {
    const academy = await api
      .post('/academies', {
        name: sanitizedName,
        ownerWallet,
        createdBy: admin,
      })
      .then((r) => r.data);
    return NextResponse.json(academy, { status: 201 });
  } catch (err: any) {
    const status = err?.response?.status ?? 502;
    const message = err?.response?.data?.error ?? 'Failed to create academy';
    return NextResponse.json({ error: message }, { status });
  }
}
