import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHmac } from 'crypto';
import { requireAdminWallet } from '@/lib/auth/walletAuth';
import { AdminAuditStore } from '@/lib/adminAuditStore';

export const dynamic = 'force-dynamic';

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
type Severity = (typeof SEVERITIES)[number];

const MAX_CONTEXT_BYTES = 4096;
const MAX_LIMIT = 200;
const TIMESTAMP_WINDOW_MS = 24 * 60 * 60 * 1000;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function verifyServiceAuth(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.MODERATION_WEBHOOK_SECRET;
  if (!secret) return false;

  const signature = req.headers.get('x-signature');
  const timestamp = req.headers.get('x-signature-timestamp');
  if (signature && timestamp) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(Date.now() - ts) > TIMESTAMP_WINDOW_MS) return false;
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    return safeEqual(signature, expected);
  }

  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return safeEqual(auth.slice('Bearer '.length), secret);
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(req: NextRequest) {
  if (!process.env.MODERATION_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Moderation webhook secret not configured' }, { status: 503 });
  }

  const rawBody = await req.text();

  if (!verifyServiceAuth(req, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isPlainObject(body)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { id, userId, threadId, rule, severity, timestamp, context } = body as Record<string, unknown>;

  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
  }
  if (threadId !== undefined && typeof threadId !== 'string') {
    return NextResponse.json({ error: 'Invalid threadId' }, { status: 400 });
  }
  if (typeof rule !== 'string' || !rule) {
    return NextResponse.json({ error: 'Invalid rule' }, { status: 400 });
  }
  if (typeof severity !== 'string' || !SEVERITIES.includes(severity as Severity)) {
    return NextResponse.json({ error: 'Invalid severity' }, { status: 400 });
  }
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return NextResponse.json({ error: 'Invalid timestamp' }, { status: 400 });
  }
  if (Math.abs(Date.now() - timestamp) > TIMESTAMP_WINDOW_MS) {
    return NextResponse.json({ error: 'Timestamp out of range' }, { status: 400 });
  }
  if (context !== undefined) {
    if (!isPlainObject(context)) {
      return NextResponse.json({ error: 'Invalid context' }, { status: 400 });
    }
    if (Buffer.byteLength(JSON.stringify(context)) > MAX_CONTEXT_BYTES) {
      return NextResponse.json({ error: 'Context too large' }, { status: 413 });
    }
  }

  await AdminAuditStore.addEntry({
    id,
    adminWallet: 'system',
    action: 'automated_moderation',
    target: userId,
    txHash: id,
    timestamp,
    metadata: {
      threadId: threadId ?? null,
      rule,
      severity,
      context: context ?? null,
    },
  });

  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminWallet(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: auth.status ?? 401 });
  }

  const limitParam = req.nextUrl.searchParams.get('limit');
  let limit = 50;
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed)) {
      return NextResponse.json({ error: 'Invalid limit' }, { status: 400 });
    }
    limit = Math.min(Math.max(parsed, 1), MAX_LIMIT);
  }

  const entries = await AdminAuditStore.getEntries({ action: 'automated_moderation', limit });
  return NextResponse.json({ entries });
}
