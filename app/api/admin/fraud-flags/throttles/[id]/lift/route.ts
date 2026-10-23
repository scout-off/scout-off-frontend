import { NextRequest } from 'next/server';
import { requireAdminWallet } from '@/lib/adminAuth';
import { FraudThrottleStore } from '@/lib/fraudThrottleStore';
import { createRequestLogger } from '@/lib/logger';
import { sanitizeTextInput } from '@/lib/inputValidation';
import { privateJson } from '@/lib/httpResponses';
import { apiError, ApiErrorCode } from '@/lib/apiErrors';

// Lift-reason is free-form admin note — cap at 500 characters (same as bio).
const LIFT_REASON_MAX = 500;

export const runtime = 'nodejs';

/**
 * POST /api/admin/fraud-flags/throttles/:id/lift
 *
 * The ONLY way an admin-gated throttle (issue #1174) changes state — there
 * is no scheduled/automatic expiry anywhere in this codebase. Body:
 * { reason?: string }.
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const adminWallet = requireAdminWallet(req);
  if (!adminWallet) {
    return apiError(ApiErrorCode.FORBIDDEN, 403, 'Admin access required');
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return apiError(ApiErrorCode.INVALID_FIELD_VALUE, 400, 'Invalid throttle id', { field: 'id' });
  }

  const body = await req.json().catch(() => ({}));
  const rawReason =
    body && typeof body === 'object' && typeof (body as any).reason === 'string'
      ? (body as any).reason.trim() || undefined
      : undefined;

  if (rawReason !== undefined) {
    const sanitizedReason = sanitizeTextInput(rawReason);
    if (sanitizedReason.length > LIFT_REASON_MAX) {
      return privateJson(
        { error: `reason must be at most ${LIFT_REASON_MAX} characters` },
        { status: 400 },
      );
    }
  }

  const reason =
    rawReason !== undefined ? sanitizeTextInput(rawReason) : undefined;

  const log = createRequestLogger(req);
  try {
    const lifted = FraudThrottleStore.getInstance().liftThrottle(
      id,
      adminWallet,
      reason,
    );
    if (!lifted) {
      return apiError(ApiErrorCode.THROTTLE_NOT_FOUND, 404, 'Throttle not found or already lifted');
    }
    return privateJson(lifted);
  } catch (err) {
    log.error('Failed to lift fraud throttle', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return apiError(ApiErrorCode.INTERNAL_ERROR, 500, 'Failed to lift throttle');
  }
}
