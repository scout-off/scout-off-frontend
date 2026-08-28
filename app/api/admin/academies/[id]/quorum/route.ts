import { NextRequest, NextResponse } from 'next/server';
import api from '@/lib/api';
import { requireAdminWallet } from '@/lib/adminAuth';

/**
 * PATCH /api/admin/academies/:id/quorum
 *
 * Sets (or, with `quorum: null`, clears) an academy's milestone-approval
 * quorum (issue #1185) — same super-admin gate as every other
 * app/api/admin/academies/** route (see docs/academy-validator-model.md's
 * "Admin flow" section), proxied straight through to the server/ service.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { quorum } = await req.json().catch(() => ({}));
  if (quorum !== null && (!Number.isInteger(quorum) || quorum < 1)) {
    return NextResponse.json(
      { error: 'quorum must be a positive integer, or null to clear it' },
      { status: 400 },
    );
  }

  try {
    const academy = await api
      .patch(`/academies/${encodeURIComponent(params.id)}/quorum`, { quorum })
      .then((r) => r.data);
    return NextResponse.json(academy);
  } catch (err: any) {
    const status = err?.response?.status ?? 502;
    const message = err?.response?.data?.error ?? 'Failed to set quorum';
    return NextResponse.json({ error: message }, { status });
  }
}
