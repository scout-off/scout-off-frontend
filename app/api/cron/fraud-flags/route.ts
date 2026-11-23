import { NextRequest } from 'next/server';
import { runFraudFlagEvaluation } from '@/lib/fraudFlagsRunner';
import { FraudFlagsStore } from '@/lib/fraudFlagsStore';
import { privateJson } from '@/lib/httpResponses';
import { verifyCronRequest } from '@/lib/cronAuth';

/**
 * Scheduled trigger for fraud-flag evaluation (issue #1007). This
 * deployment has no background-job infrastructure, so the realistic
 * mechanism investigated and picked here is a Vercel Cron Job (see
 * vercel.json's `crons` entry and docs/fraud-detection.md) hitting this
 * route on a fixed schedule, independent of any admin opening
 * FraudFlagsPanel.tsx.
 *
 * Authorization: see lib/cronAuth.ts — uses CRON_SECRET (fail-closed) with
 * a constant-time comparison (#1490).
 */
export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  const result = await runFraudFlagEvaluation({
    mode: 'incremental',
    trigger: 'cron',
    timeBudgetMs: 45_000,
  });
  const evaluatedAt = result.evaluatedAt ?? Date.now();
  const eventsProcessed = result.eventsProcessed ?? 0;
  const durationMs = result.durationMs ?? 0;
  const run = FraudFlagsStore.getInstance().recordRun(
    'cron',
    result.flags,
    result.warnings,
    evaluatedAt,
    eventsProcessed,
    durationMs,
  );

  // At minimum-viable "proactive surfacing" absent any existing outbound
  // notification channel (email/Slack/push — none exist in this codebase
  // today, verified during investigation): a high-severity run is at least
  // observable in the cron invocation's own logs/response, and drives the
  // staleness/high-severity badge in the admin dashboard
  // (GET /api/admin/fraud-flags/status). A fuller integration (e.g. paging
  // an on-call channel when highSeverityCount crosses a threshold) is a
  // follow-up that requires picking a notification provider — out of scope
  // here; see docs/fraud-detection.md.
  return privateJson({
    evaluatedAt,
    flagCount: result.flags.length,
    highSeverityCount: run.highSeverityCount,
    eventsProcessed,
    durationMs,
    warnings: result.warnings,
  });
}
