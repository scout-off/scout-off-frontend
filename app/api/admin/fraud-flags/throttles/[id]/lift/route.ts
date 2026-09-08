import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWallet } from '@/lib/adminAuth';
import { FraudThrottleStore } from '@/lib/fraudThrottleStore';
import { createRequestLogger } from '@/lib/logger';
import { sanitizeTextInput } from '@/lib/inputValidation';

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
  { params }: { params: { id: string } },
) {
  const adminWallet = requireAdminWallet(req);
  if (!adminWallet) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid throttle id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const rawReason =
    body && typeof body === 'object' && typeof (body as any).reason === 'string'
      ? (body as any).reason.trim() || undefined
      : undefined;

  if (rawReason !== undefined) {
    const sanitizedReason = sanitizeTextInput(rawReason);
    if (sanitizedReason.length > LIFT_REASON_MAX) {
      return NextResponse.json(
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
      return NextResponse.json(
        { error: 'Throttle not found or already lifted' },
        { status: 404 },
      );
    }
    return NextResponse.json(lifted);
  } catch (err) {
    log.error('Failed to lift fraud throttle', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to lift throttle' },
      { status: 500 },
    );
  }
}
