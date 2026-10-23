import { NextRequest } from 'next/server';
import api from '@/lib/api';
import { requireAdminWallet } from '@/lib/adminAuth';
import { privateJson } from '@/lib/httpResponses';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { upstreamStatus } from '@/lib/httpClient';

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
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const admin = requireAdminWallet(req);
  if (!admin) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const { quorum } = await req.json().catch(() => ({}));
  if (quorum !== null && (!Number.isInteger(quorum) || quorum < 1)) {
    return privateJson(
      { error: 'quorum must be a positive integer, or null to clear it' },
      { status: 400 },
    );
  }

  try {
    const academy = await api
      .patch(`/academies/${encodeURIComponent(params.id)}/quorum`, { quorum })
      .then((r) => r.data);
    return privateJson(academy);
  } catch (err: unknown) {
    const status = upstreamStatus(err);
    const message = getErrorMessage(err, 'Failed to set quorum');
    return privateJson({ error: message }, { status });
  }
}
