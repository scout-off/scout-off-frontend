# Fraud-detection backtesting harness (#1183)

`lib/fraudDetection.ts` ships every threshold as a named constant that the
design doc is explicit is **unvalidated** — reasoned starting points, not
calibrated against real traffic. This harness lets you replay a historical
window of referral + activity data through the heuristics and see what _would_
have fired, at the current thresholds _or at hypothetical ones, without
editing `lib/fraudDetection.ts` or deploying anything_.

It is **strictly offline and side-effect free**: it only calls the pure
`analyzeReferralAbuse` / `analyzePayToContactAbuse` functions, never the
auto-throttle path (`lib/fraudFlagsRunner.ts`), never any network/backend.
Running it cannot trigger a real fraud-detection side effect.

## Components

- `lib/fraudBacktest.ts` — the engine (pure, no I/O beyond optional file reads/writes you pass in).
- `scripts/backtest-fraud.ts` — CLI wrapper, run via `npm run backtest:fraud`.
- `__tests__/lib/fraudBacktest.test.ts` — regression tests (also a runnable example).

## Getting historical data

The harness needs two arrays: `ReferralCode[]` and `ActivityEvent[]`. Supply
them either as a combined snapshot or from the existing local stores.

**Combined snapshot** (`{ "referralCodes": [...], "activityEvents": [...] }`):

```bash
npm run backtest:fraud -- --snapshot data/fraud-backtest-snapshot.json
```

**Local referral store + activity export** (the referral store is a local JSON
file; `ActivityEvent`s come from an export of the indexer/activity feed):

```bash
npm run backtest:fraud -- --from-store data/referrals.json --activity data/activity.json
```

`--from-store` reads `data/referrals.json` and converts `ReferralEntry` (ISO
strings) into `ReferralCode` (epoch ms) offline.

**No data yet?** Generate a synthetic but representative dataset and run
immediately:

```bash
npm run backtest:fraud -- --generate-sample
```

## Answering "what if" threshold questions

Override any subset of thresholds for a run — no code edit, no redeploy:

```bash
npm run backtest:fraud -- --generate-sample \
  --thresholds '{"CONCENTRATION_RATIO_THRESHOLD":0.4}'
```

Sweep a single threshold across a range to see how flag volume moves
(`heuristic:KEY=min:max:step`):

```bash
npm run backtest:fraud -- --generate-sample \
  --sweep 'concentrated_redeemer:CONCENTRATION_RATIO_THRESHOLD=0.3:0.6:0.05'
```

## Reading the report

Every run prints:

- **Flags per heuristic** with a high/medium/low severity breakdown — the
  aggregate counts you tune against.
- **A full list of flagged cases** (id, wallets, reason, and the structured
  `evidence` object) so a human can spot-check a sample and judge
  true- vs false-positives before trusting any threshold change.
- An optional **sweep table** of total flags per threshold value.

Machine-readable output for further analysis:

```bash
npm run backtest:fraud -- --generate-sample --format json --out data/fraud-backtest-report.json
```

## Suggested workflow

1. Export a real historical window (referral store + activity feed).
2. Run at current thresholds; review the per-case evidence to estimate the
   false-positive rate on known-good accounts.
3. Sweep the thresholds that look miscalibrated; pick values that keep the
   false-positive rate acceptable while still catching the abuse you care about.
4. Only then update the constants in `lib/fraudDetection.ts` (or, for the
   separately-tracked auto-throttling work, feed the validated numbers in).
