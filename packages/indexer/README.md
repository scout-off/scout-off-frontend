# ScoutOff Indexer

Off-chain event indexer for the ScoutOff platform. Subscribes to Soroban contract events emitted by the ScoutOff smart contract on Stellar, persists them for fast querying, and exposes an HTTP server for health checks and Prometheus-compatible metrics.

## Table of Contents

- [Purpose and Architecture](#purpose-and-architecture)
- [Setup and Installation](#setup-and-installation)
- [Environment Variables](#environment-variables)
- [Indexed Event Schema](#indexed-event-schema)
- [IndexerMetrics](#indexermetrics)
- [Querying Indexed Data](#querying-indexed-data)
- [HTTP API Reference](#http-api-reference)
- [Prometheus Scrape Config](#prometheus-scrape-config)
- [Tests](#tests)

---

## Purpose and Architecture

The ScoutOff smart contract emits on-chain events for every state change (player registration, milestone approvals, scout subscriptions, etc.). The indexer listens to these events via the Stellar Soroban RPC `getEvents` stream, decodes them, and stores them off-chain so the frontend can query historical data without hitting the RPC node for every page load.

```
Stellar Network
    │  Soroban RPC  getEvents
    ▼
┌─────────────────────────────┐
│  Event Listener / Poller    │  Polls ledger-by-ledger; tracks last
│  (ledgerTracker.ts)         │  indexed sequence + network head
└────────────┬────────────────┘
             │  decoded EventType
             ▼
┌─────────────────────────────┐
│  IndexerMetrics             │  In-process counters, latency EMA,
│  (metrics/IndexerMetrics.ts)│  sliding-window rates, health flag
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  HTTP Server (server.ts)    │  GET /health  GET /metrics
│  Port: 3001 (default)       │
└─────────────────────────────┘
```

Key design decisions:

- **Zero external dependencies** for metrics — plain TypeScript counters/gauges, no `prom-client`.
- **Singleton `IndexerMetrics`** — safe to import from multiple modules; one registry per process.
- **Fixed-size sliding window** (500 entries, 60 s) bounds memory growth while still producing meaningful rate and p95 latency values.
- **Ledger lag tracking** — `ledgerTracker` independently tracks the network head vs. last indexed ledger so the `/health` endpoint can report degraded state when the indexer falls behind.

---

## Setup and Installation

### Prerequisites

- Node.js ≥ 18
- Access to a Stellar Soroban RPC endpoint (testnet or mainnet)
- The deployed ScoutOff contract address

### Install

```bash
# From the repo root
npm install

# Or from this package directory
cd packages/indexer
npm install
```

### Build

```bash
cd packages/indexer
npx tsc
# Output written to dist/
```

### Run

```bash
# Default port 3001
node dist/server.js

# Override port
PORT=9090 node dist/server.js
```

### Development (watch mode)

```bash
npx ts-node-dev src/server.ts
```

---

## Environment Variables

| Variable             | Required | Default            | Description                                                      |
| -------------------- | -------- | ------------------ | ---------------------------------------------------------------- |
| `PORT`               | No       | `3001`             | HTTP server port for `/health` and `/metrics`                    |
| `SOROBAN_RPC_URL`    | Yes      | —                  | Soroban RPC endpoint, e.g. `https://soroban-testnet.stellar.org` |
| `CONTRACT_ID`        | Yes      | —                  | Deployed ScoutOff contract address (Strkey format)               |
| `NETWORK_PASSPHRASE` | No       | Testnet passphrase | Stellar network passphrase used to decode event XDR              |
| `POLL_INTERVAL_MS`   | No       | `5000`             | How often (ms) to poll for new ledgers                           |
| `START_LEDGER`       | No       | `0`                | Ledger sequence to start indexing from (0 = latest)              |
| `LOG_LEVEL`          | No       | `info`             | Log verbosity: `debug`, `info`, `warn`, `error`                  |

Copy `.env.example` in the repo root and fill in the required values:

```bash
cp ../../.env.example ../../.env.local
```

---

## Indexed Event Schema

The indexer processes seven event types emitted by the ScoutOff contract. All events carry a `ledger` sequence number and `timestamp` (Unix seconds) sourced from the Soroban event envelope.

### `player_registered`

Emitted when a player calls `register_player`.

| Field       | Type     | Description                          |
| ----------- | -------- | ------------------------------------ |
| `player_id` | `string` | On-chain player identifier           |
| `wallet`    | `string` | Stellar public key of the player     |
| `ipfs_hash` | `string` | IPFS CID of the initial media upload |
| `ledger`    | `number` | Ledger sequence                      |
| `timestamp` | `number` | Unix timestamp (seconds)             |

### `milestone_approved`

Emitted when a validator calls `approve_milestone`.

| Field          | Type     | Description                                  |
| -------------- | -------- | -------------------------------------------- |
| `player_id`    | `string` | Target player                                |
| `milestone_id` | `string` | Unique milestone identifier                  |
| `description`  | `string` | Human-readable milestone text                |
| `validator`    | `string` | Validator's Stellar public key               |
| `new_level`    | `number` | Player's progress level after approval (1–3) |
| `ledger`       | `number` | Ledger sequence                              |
| `timestamp`    | `number` | Unix timestamp (seconds)                     |

### `milestone_revoked`

Emitted when a validator or admin calls `revoke_milestone`.

| Field          | Type     | Description                   |
| -------------- | -------- | ----------------------------- |
| `player_id`    | `string` | Target player                 |
| `milestone_id` | `string` | Revoked milestone identifier  |
| `revoked_by`   | `string` | Stellar public key of revoker |
| `ledger`       | `number` | Ledger sequence               |
| `timestamp`    | `number` | Unix timestamp (seconds)      |

### `scout_subscribed`

Emitted when a scout calls `subscribe`.

| Field       | Type     | Description                                     |
| ----------- | -------- | ----------------------------------------------- |
| `scout`     | `string` | Scout's Stellar public key                      |
| `tier`      | `string` | Subscription tier (`basic` \| `pro` \| `elite`) |
| `expiry`    | `number` | Unix timestamp when subscription expires        |
| `fee_xlm`   | `string` | XLM amount paid (string to preserve precision)  |
| `ledger`    | `number` | Ledger sequence                                 |
| `timestamp` | `number` | Unix timestamp (seconds)                        |

### `player_contacted`

Emitted when a scout calls `pay_to_contact`.

| Field       | Type     | Description                       |
| ----------- | -------- | --------------------------------- |
| `scout`     | `string` | Scout's Stellar public key        |
| `player_id` | `string` | Player whose contact was unlocked |
| `fee_xlm`   | `string` | XLM fee paid                      |
| `ledger`    | `number` | Ledger sequence                   |
| `timestamp` | `number` | Unix timestamp (seconds)          |

### `trial_offer_logged`

Emitted when a scout calls `log_trial_offer` (advances player to Level 3).

| Field       | Type     | Description                   |
| ----------- | -------- | ----------------------------- |
| `scout`     | `string` | Scout's Stellar public key    |
| `player_id` | `string` | Player who received the offer |
| `details`   | `string` | Free-text trial offer details |
| `ledger`    | `number` | Ledger sequence               |
| `timestamp` | `number` | Unix timestamp (seconds)      |

### `fees_withdrawn`

Emitted when an admin calls `withdraw_fees`.

| Field        | Type     | Description                  |
| ------------ | -------- | ---------------------------- |
| `to`         | `string` | Recipient Stellar public key |
| `amount_xlm` | `string` | XLM amount withdrawn         |
| `ledger`     | `number` | Ledger sequence              |
| `timestamp`  | `number` | Unix timestamp (seconds)     |

---

## IndexerMetrics

`IndexerMetrics` (`src/metrics/IndexerMetrics.ts`) is a lightweight, zero-dependency singleton that tracks indexer health and performance. It is used by the event processing loop to record each outcome and by `server.ts` to serve the `/metrics` endpoint.

### Usage

```typescript
import { IndexerMetrics } from './metrics/IndexerMetrics';

const metrics = IndexerMetrics.getInstance();

// Record a successfully processed event
metrics.recordSuccess('player_registered', latencyMs, payloadBytes);

// Record a failed processing attempt
metrics.recordFailure(latencyMs);

// Record a retry (does not count as a new processed event)
metrics.recordRetry();

// Mark healthy after recovering from errors
metrics.markHealthy();

// Read a point-in-time snapshot
const snap = metrics.snapshot();
console.log(snap.ingestionRatePerSec, snap.latencyP95Ms, snap.isHealthy);
```

### What It Tracks

| Metric                  | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `totalProcessed`        | Cumulative events processed (successes + failures)  |
| `totalSuccesses`        | Cumulative successfully processed events            |
| `totalFailures`         | Cumulative failed processing attempts               |
| `totalRetries`          | Cumulative retry attempts                           |
| `totalBytesIngested`    | Cumulative payload bytes processed                  |
| `eventCounts`           | Per-`EventType` success counter                     |
| `lastProcessedAt`       | Unix ms timestamp of the last processed event       |
| `consecutiveErrors`     | Unbroken run of failures since last success         |
| `isHealthy`             | `false` when `consecutiveErrors ≥ 5`                |
| `ingestionRatePerSec`   | Events per second over the last 60 s sliding window |
| `errorRatePercent`      | `(failures / processed) × 100` (lifetime)           |
| `successRatePercent`    | `(successes / processed) × 100` (lifetime)          |
| `latencyAvgMs`          | Exponential moving average latency (α = 0.1)        |
| `latencyP95Ms`          | 95th-percentile latency over 60 s sliding window    |
| `throughputBytesPerSec` | Bytes per second over 60 s sliding window           |

### Singleton and Testing

```typescript
// In tests: reset between cases to isolate state
import { IndexerMetrics } from './metrics/IndexerMetrics';
afterEach(() => IndexerMetrics.resetInstance());

// Inject a mock clock for deterministic time-based tests
const mockNow = jest.fn(() => 1_000_000);
const metrics = IndexerMetrics.getInstance(mockNow);
```

---

## Querying Indexed Data

### HTTP API

The indexer exposes two endpoints from `server.ts`:

#### `GET /health`

JSON health check. Returns `200` whether healthy or degraded.

```bash
curl http://localhost:3001/health
```

```json
{
  "status": "ok",
  "lastLedger": 54321,
  "uptime": 3600
}
```

| Field        | Type                   | Description                                         |
| ------------ | ---------------------- | --------------------------------------------------- |
| `status`     | `"ok"` \| `"degraded"` | `"degraded"` when no ledger update in the last 60 s |
| `lastLedger` | `number`               | Last indexed ledger sequence (0 = none yet)         |
| `uptime`     | `number`               | Server uptime in seconds                            |

#### `GET /metrics`

Prometheus text format (exposition format 0.0.4). Scrape this with Prometheus or `curl`.

```bash
curl http://localhost:3001/metrics
```

```
# HELP indexer_events_total Total events processed by type
# TYPE indexer_events_total counter
indexer_events_total{type="player_registered"} 42
indexer_events_total{type="milestone_approved"} 17
indexer_events_total{type="milestone_revoked"} 2
indexer_events_total{type="scout_subscribed"} 8
indexer_events_total{type="player_contacted"} 25
indexer_events_total{type="trial_offer_logged"} 3
indexer_events_total{type="fees_withdrawn"} 1
indexer_events_total{type="fees_withdrawn"} 1
# HELP indexer_processed_total Total events processed (all types)
# TYPE indexer_processed_total counter
indexer_processed_total 98
# HELP indexer_errors_total Total processing failures
# TYPE indexer_errors_total counter
indexer_errors_total 3
# HELP indexer_error_rate_percent Failure rate as a percentage
# TYPE indexer_error_rate_percent gauge
indexer_error_rate_percent 3.0612
# HELP indexer_latency_avg_ms Processing latency EMA in milliseconds
# TYPE indexer_latency_avg_ms gauge
indexer_latency_avg_ms 12.3400
# HELP indexer_latency_p95_ms Processing latency p95 (sliding window)
# TYPE indexer_latency_p95_ms gauge
indexer_latency_p95_ms 48.0000
# HELP indexer_ledger_lag Difference between network and last indexed ledger
# TYPE indexer_ledger_lag gauge
indexer_ledger_lag 2
# HELP indexer_healthy 1 if healthy, 0 if degraded
# TYPE indexer_healthy gauge
indexer_healthy 1
```

### Metric Reference

| Metric                       | Type    | Description                                 |
| ---------------------------- | ------- | ------------------------------------------- |
| `indexer_events_total{type}` | counter | Per-event-type success count                |
| `indexer_processed_total`    | counter | Total events processed                      |
| `indexer_errors_total`       | counter | Total failures                              |
| `indexer_error_rate_percent` | gauge   | Rolling failure rate                        |
| `indexer_latency_avg_ms`     | gauge   | EMA processing latency                      |
| `indexer_latency_p95_ms`     | gauge   | p95 latency over 60 s window                |
| `indexer_ledger_lag`         | gauge   | Network head minus last indexed ledger      |
| `indexer_healthy`            | gauge   | `1` = healthy, `0` = ≥ 5 consecutive errors |

---

## Prometheus Scrape Config

```yaml
scrape_configs:
  - job_name: scoutoff_indexer
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3001']
```

---

## Tests

```bash
# Run indexer tests only (from repo root)
npx jest packages/indexer --no-coverage

# Run with coverage
npx jest packages/indexer --coverage
```

Test files live in:

- `src/__tests__/server.test.ts` — HTTP server endpoint tests
- `src/metrics/__tests__/` — `IndexerMetrics` unit tests (singleton, counters, sliding window, p95, health flag)
