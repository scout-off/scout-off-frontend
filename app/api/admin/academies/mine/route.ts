import { NextRequest, NextResponse } from 'next/server';
import { resolveAcademyRole } from '@/lib/academyAuth';

// GET /api/admin/academies/mine
//
// Lets the *connected* wallet discover which academy/academies (if any) it
// may manage, without needing the super-admin-only `GET /api/admin/academies`
// list — that route intentionally stays gated to the super-admin (an
// academy owner has no business seeing every other academy's roster). This
// is the entry point the scoped academy-owner UI (AcademyOwnerManager) uses
// to find its own academyId(s) after the caller connects their wallet.
//
// A super-admin caller who does not also happen to own an academy gets an
// empty array here (by design) rather than the full admin list — this
// route answers "what can *this* wallet self-serve," not "what can the
// super-admin see."
export async function GET(req: NextRequest) {
  const role = await resolveAcademyRole(req);
  if (!role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (role.role === 'super-admin') {
    return NextResponse.json([]);
  }

  return NextResponse.json(role.academies);
}
