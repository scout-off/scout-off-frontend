import { NextRequest } from 'next/server';
import { AdminAuditStore } from '@/lib/adminAuditStore';

/**
 * POST /api/admin/automated-moderation-log
 *
 * Records an automated moderation decision (auto-block, auto-flag, etc.)
 * for admin review. Called by the chat API server when it makes an
 * automated moderation decision.
 *
 * This is fire-and-forget: the moderation action itself has already been
 * applied before this logging call, so a network failure here doesn't
 * delay or block the moderation action.
 *
 * Per privacy considerations, message content is NOT stored — only
 * metadata (user IDs, thread ID, rule that triggered, timestamp).
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();
    const { id, category, rule, severity, userId, threadId, timestamp, context } = body;

    // Validate required fields
    if (!id || !category || !rule || !severity || !userId || !timestamp) {
      return new Response('Missing required fields', { status: 400 });
    }

    const adminStore = AdminAuditStore.getInstance();

    // Record in the admin audit store with our action type prefix
    adminStore.insertEntry({
      actionType: `automated_moderation_${category}`,
      adminWallet: 'system',
      target: threadId ?? userId,
      amountStroops: null,
      txHash: id,
      status: 'confirmed',
      timestamp,
      data: {
        rule,
        severity,
        userId,
        context: context ?? {},
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to record automated moderation entry:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

/**
 * GET /api/admin/automated-moderation-log
 *
 * Returns automated moderation decisions for admin review.
 * Supports filtering by user, date range, and category prefix.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  try {
    const adminStore = AdminAuditStore.getInstance();

    // Query entries with our action type prefix
    const entries = adminStore.getEntries({
      actionType: 'automated_moderation',
      from: from ? parseInt(from, 10) : undefined,
      to: to ? parseInt(to, 10) : undefined,
      limit,
    });

    // Filter by userId if specified
    let filtered = entries;
    if (userId) {
      filtered = entries.filter((entry) => {
        const entryUserId = entry.data?.userId as string | undefined;
        return entryUserId === userId;
      });
    }

    return new Response(JSON.stringify(filtered), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to fetch automated moderation entries:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
