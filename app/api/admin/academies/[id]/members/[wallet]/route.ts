import { NextRequest } from 'next/server';
import api from '@/lib/api';
import { requireAcademyManager } from '@/lib/academyAuth';
import { privateJson } from '@/lib/httpResponses';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { upstreamStatus } from '@/lib/httpClient';

// Reachable by the super-admin (any academy) or that academy's recorded
// ownerWallet (their own academy only) — see lib/academyAuth.ts (issue #1173).
export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string; wallet: string }> },
) {
  const params = await props.params;
  const manager = await requireAcademyManager(req, params.id);
  if (!manager) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await api.delete(
      `/academies/${encodeURIComponent(params.id)}/members/${encodeURIComponent(params.wallet)}`,
    );
    return privateJson({ success: true });
  } catch (err: unknown) {
    const status = upstreamStatus(err);
    const message = getErrorMessage(err, 'Failed to remove signer wallet');
    return privateJson({ error: message }, { status });
  }
}
