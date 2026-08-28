import { NextRequest, NextResponse } from 'next/server';
import api from '@/lib/api';
import { requireAcademyManager } from '@/lib/academyAuth';

// Reachable by the super-admin (any academy) or that academy's recorded
// ownerWallet (their own academy only) — see lib/academyAuth.ts (issue #1173).
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; wallet: string } },
) {
  const manager = await requireAcademyManager(req, params.id);
  if (!manager) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await api.delete(
      `/academies/${encodeURIComponent(params.id)}/members/${encodeURIComponent(params.wallet)}`,
    );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    const status = err?.response?.status ?? 502;
    const message =
      err?.response?.data?.error ?? 'Failed to remove signer wallet';
    return NextResponse.json({ error: message }, { status });
  }
}
