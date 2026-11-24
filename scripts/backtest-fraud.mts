#!/usr/bin/env node
/**
 * backtest-fraud.ts — offline fraud-detection backtesting harness (issue #1183)
 *
 * Replays a historical window of referral + activity data through the pure
 * heuristics in lib/fraudDetection.ts and reports how many flags each heuristic
 * would produce at the *current* threshold values, at *overridden* values, or
 * across a *sweep* of one threshold — so thresholds can be tuned with evidence
 * before any change ships to production.
 *
 * This script is strictly read-only: it loads a local snapshot/export, calls
 * the pure analyzers, and optionally writes a report file. It never contacts a
 * production backend and never runs the auto-throttle path, so it cannot
 * trigger a real fraud-detection side effect.
 *
 * Run with:  npm run backtest:fraud -- [options]
 *
 * Examples:
 *   # Run against the sample dataset (no real data needed):
 *   npm run backtest:fraud -- --generate-sample
 *
 *   # Run against a combined snapshot export:
 *   npm run backtest:fraud -- --snapshot data/fraud-backtest-snapshot.json
 *
 *   # Run against the local on-disk referral store + an activity export:
 *   npm run backtest:fraud -- --from-store data/referrals.json --activity data/activity.json
 *
 *   # Override one threshold ("what if concentrated_redeemer were 40%?"):
 *   npm run backtest:fraud -- --generate-sample --thresholds '{"CONCENTRATION_RATIO_THRESHOLD":0.4}'
 *
 *   # Sweep concentrated_redeemer's ratio 30%..60% in 5% steps:
 *   npm run backtest:fraud -- --generate-sample --sweep 'concentrated_redeemer:CONCENTRATION_RATIO_THRESHOLD=0.3:0.6:0.05'
 *
 *   # Machine-readable output to a file:
 *   npm run backtest:fraud -- --generate-sample --format json --out data/fraud-backtest-report.json
 */

import {
  generateSampleSnapshot,
  loadSnapshot,
  loadReferralSnapshotFromStore,
  loadActivitySnapshot,
  writeSnapshot,
  runBacktest,
  formatReport,
  saveReport,
  type BacktestSnapshot,
  type ReportFormat,
  type SweepConfig,
} from '../lib/fraudBacktest.ts';
import { DEFAULT_THRESHOLDS, type FraudThresholds } from '../lib/fraudDetection.ts';

interface CliOptions {
  snapshot?: string;
  fromStore?: string;
  activity?: string;
  generateSample?: string; // path to also persist the generated snapshot, or ''
  thresholds?: string; // raw JSON
  sweep?: string; // raw "heuristic:KEY=min:max:step"
  out?: string;
  format: ReportFormat;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    format: 'text',
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) {
        throw new Error(`Option ${arg} requires a value`);
      }
      i++;
      return v;
    };
    switch (arg) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--snapshot':
        opts.snapshot = next();
        break;
      case '--from-store': {
        const v = argv[i + 1];
        if (v === undefined || v.startsWith('--')) {
          opts.fromStore = 'data/referrals.json';
        } else {
          opts.fromStore = v;
          i++;
        }
        break;
      }
      case '--activity':
        opts.activity = next();
        break;
      case '--generate-sample': {
        const v = argv[i + 1];
        if (v === undefined || v.startsWith('--')) {
          opts.generateSample = '';
        } else {
          opts.generateSample = v;
          i++;
        }
        break;
      }
      case '--thresholds':
        opts.thresholds = next();
        break;
      case '--sweep':
        opts.sweep = next();
        break;
      case '--out':
        opts.out = next();
        break;
      case '--format':
        opts.format = next() as ReportFormat;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

const USAGE = `Usage: npm run backtest:fraud -- [options]

  --snapshot <path>        Combined snapshot JSON {referralCodes, activityEvents}
  --from-store [path]      Load referral codes from the local store (default data/referrals.json)
  --activity <path>        Activity-event export JSON (used with --from-store)
  --generate-sample [path] Generate a synthetic snapshot and run on it; optionally persist to <path>
  --thresholds '<json>'    Override thresholds, e.g. '{"CONCENTRATION_RATIO_THRESHOLD":0.4}'
  --sweep 'h:KEY=min:max:step'
                           Sweep one threshold, e.g. 'concentrated_redeemer:CONCENTRATION_RATIO_THRESHOLD=0.3:0.6:0.05'
  --out <path>             Write the report to a file (default: print to stdout)
  --format text|json       Report format (default text)
  -h, --help               Show this help`;

function parseThresholds(raw: string | undefined): Partial<FraudThresholds> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`--thresholds must be valid JSON: ${raw}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('--thresholds must be a JSON object');
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!(k in DEFAULT_THRESHOLDS)) {
      throw new Error(
        `--thresholds: unknown threshold "${k}". Valid keys: ${Object.keys(
          DEFAULT_THRESHOLDS,
        ).join(', ')}`,
      );
    }
    if (typeof v !== 'number') {
      throw new Error(`--thresholds: value for "${k}" must be a number`);
    }
    out[k] = v;
  }
  return out as Partial<FraudThresholds>;
}

function parseSweep(raw: string | undefined): SweepConfig | undefined {
  if (!raw) return undefined;
  const eq = raw.indexOf('=');
  if (eq === -1) {
    throw new Error(
      `--sweep must look like 'heuristic:KEY=min:max:step' (got "${raw}")`,
    );
  }
  const left = raw.slice(0, eq);
  const right = raw.slice(eq + 1);
  const colon = left.indexOf(':');
  if (colon === -1) {
    throw new Error(`--sweep left side must be 'heuristic:KEY' (got "${left}")`);
  }
  const heuristic = left.slice(0, colon);
  const key = left.slice(colon + 1) as keyof FraudThresholds;
  if (!(key in DEFAULT_THRESHOLDS)) {
    throw new Error(
      `--sweep: unknown threshold key "${key}". Valid keys: ${Object.keys(
        DEFAULT_THRESHOLDS,
      ).join(', ')}`,
    );
  }
  const [minS, maxS, stepS] = right.split(':');
  const min = Number(minS);
  const max = Number(maxS);
  const step = Number(stepS);
  if ([min, max, step].some((n) => Number.isNaN(n)) || step <= 0) {
    throw new Error(
      `--sweep range must be "min:max:step" with step > 0 (got "${right}")`,
    );
  }
  return { heuristic, thresholdKey: key, min, max, step };
}

async function resolveSnapshot(opts: CliOptions): Promise<BacktestSnapshot> {
  if (opts.snapshot) {
    return loadSnapshot(opts.snapshot);
  }
  if (opts.generateSample !== undefined) {
    const snapshot = generateSampleSnapshot();
    if (opts.generateSample) {
      await writeSnapshot(snapshot, opts.generateSample);
      process.stderr.write(
        `Wrote sample snapshot to ${opts.generateSample}\n`,
      );
    }
    return snapshot;
  }
  if (opts.fromStore) {
    const referralCodes = await loadReferralSnapshotFromStore(opts.fromStore);
    const activityEvents = opts.activity
      ? await loadActivitySnapshot(opts.activity)
      : [];
    if (!opts.activity) {
      process.stderr.write(
        'Warning: --from-store used without --activity; pay-to-contact heuristics will see no events.\n',
      );
    }
    return { referralCodes, activityEvents };
  }
  throw new Error(
    'No data source given. Use --snapshot, --generate-sample, or --from-store.',
  );
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(USAGE + '\n');
    return;
  }

  const snapshot = await resolveSnapshot(opts);
  const thresholds = parseThresholds(opts.thresholds);
  const sweep = parseSweep(opts.sweep);

  const report = runBacktest(snapshot, { thresholds, sweep });
  const text = formatReport(report, opts.format);

  if (opts.out) {
    await saveReport(text, opts.out);
    process.stderr.write(`Report written to ${opts.out}\n`);
  } else {
    process.stdout.write(text + '\n');
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : err}\n`);
  process.stderr.write(`\n${USAGE}\n`);
  process.exit(1);
});
