import { NextResponse } from "next/server";

const INDEXER_HEALTH_URL =
  process.env.INDEXER_HEALTH_URL ?? "http://localhost:3001/health";

export const dynamic = "force-dynamic";

export interface IndexerGap {
  gap_start: number;
  gap_end: number;
  status: "open" | "backfilling" | "closed";
}

export interface IndexerHealthResponse {
  status: string;
  latestLedger?: number;
  gaps?: IndexerGap[];
  [key: string]: unknown;
}

export async function GET() {
  try {
    const res = await fetch(INDEXER_HEALTH_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { status: "unavailable", gaps: [] },
        { status: 502 },
      );
    }

    const body = (await res.json()) as IndexerHealthResponse;
    const gaps = Array.isArray(body.gaps) ? body.gaps : [];
    const openGaps = gaps.filter((gap) => gap.status !== "closed");

    return NextResponse.json(
      {
        ...body,
        gaps,
        historyIncomplete: openGaps.length > 0,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable", gaps: [], historyIncomplete: false },
      { status: 502 },
    );
  }
}
