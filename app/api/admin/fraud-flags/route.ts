import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAllReferralCodes,
  fetchActivityEvents,
  type ActivityEvent,
} from '@/lib/api';
import {
  analyzeReferralAbuse,
  analyzePayToContactAbuse,
} from '@/lib/fraudDetection';
import type { FraudFlag } from '@/types';

/**
 * Bounds how much of the activity feed a single request will pull before
 * running pay-to-contact heuristics over it. This endpoint needs
 * cross-wallet visibility (the whole point of catching a pattern no single
 * request would trip), but it's computed on demand rather than by a
 * background job — see docs/fraud-detection.md — so it needs a hard cap to
 * stay responsive regardless of how large the activity feed grows.
 */
const ACTIVITY_PAGE_SIZE = 200;
const MAX_ACTIVITY_PAGES = 25; // up to 5,000 events

async function fetchAllActivityEvents(): Promise<{
  events: ActivityEvent[];
  truncated: boolean;
}> {
  const events: ActivityEvent[] = [];
  let page = 1;
  let total = Infinity;

  while (events.length < total && page <= MAX_ACTIVITY_PAGES) {
    const res = await fetchActivityEvents(page, ACTIVITY_PAGE_SIZE);
    events.push(...res.events);
    total = res.total;
    if (res.events.length === 0) break;
    page++;
  }

  return { events, truncated: events.length < total };
}

export async function GET(req: NextRequest) {
  const sessionWallet = req.cookies.get('session')?.value;
  const adminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;

  if (!sessionWallet || !adminAddress || sessionWallet !== adminAddress) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let referralFlags: FraudFlag[] = [];
  const warnings: string[] = [];
  try {
    referralFlags = analyzeReferralAbuse(await fetchAllReferralCodes());
  } catch {
    warnings.push(
      'Referral backend is unavailable — referral heuristics were skipped. Pay-to-contact heuristics below are unaffected.',
    );
  }

  let payToContactFlags: FraudFlag[] = [];
  try {
    const { events, truncated } = await fetchAllActivityEvents();
    payToContactFlags = analyzePayToContactAbuse(events);
    if (truncated) {
      warnings.push(
        `Activity feed has more than ${MAX_ACTIVITY_PAGES * ACTIVITY_PAGE_SIZE} events; pay-to-contact analysis only covers the most recent ones.`,
      );
    }
  } catch {
    warnings.push(
      'Activity feed backend is unavailable — pay-to-contact heuristics were skipped. Referral heuristics below are unaffected.',
    );
  }

  const flags = [...referralFlags, ...payToContactFlags].sort((a, b) => {
    const severityRank = { high: 0, medium: 1, low: 2 } as const;
    return severityRank[a.severity] - severityRank[b.severity];
  });

  return NextResponse.json({ flags, warnings });
}
