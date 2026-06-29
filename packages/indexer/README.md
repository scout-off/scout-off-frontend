# ScoutOff Indexer

Off-chain event indexer for the ScoutOff platform. Listens to Stellar/Soroban contract events, tracks metrics, and exposes an HTTP server for health checks and observability.

## Running the indexer

```bash
# Default port: 3001
node dist/server.js

# Override port
PORT=9090 node dist/server.js
```

## HTTP Endpoints

### `GET /health`

Returns indexer health as JSON.

**Response `200 application/json`**

```json
{
  "status": "ok",
  "lastLedger": 54321,
  "uptime": 3600
}
```

| Field        | Type   | Description                                          |
| ------------ | ------ | ---------------------------------------------------- |
| `status`     | string | `"ok"` or `"degraded"` (no ledger update in 60 s)   |
| `lastLedger` | number | Last ledger sequence successfully indexed (0 = none) |
| `uptime`     | number | Server uptime in seconds                             |

---

### `GET /metrics`

Returns current metrics in **Prometheus text format** (exposition format 0.0.4).

**Response `200 text/plain; version=0.0.4; charset=utf-8`**

```
# HELP indexer_events_total Total events processed by type
# TYPE indexer_events_total counter
indexer_events_total{type="player_registered"} 42
indexer_events_total{type="milestone_approved"} 17
...

# HELP indexer_processed_total Total events processed (all types)
# TYPE indexer_processed_total counter
indexer_processed_total 59

# HELP indexer_errors_total Total processing failures
# TYPE indexer_errors_total counter
indexer_errors_total 3

# HELP indexer_error_rate_percent Failure rate as a percentage
# TYPE indexer_error_rate_percent gauge
indexer_error_rate_percent 5.0847

# HELP indexer_latency_avg_ms Processing latency EMA in milliseconds
# TYPE indexer_latency_avg_ms gauge
indexer_latency_avg_ms 12.3400

# HELP indexer_latency_p95_ms Processing latency p95 in milliseconds (sliding window)
# TYPE indexer_latency_p95_ms gauge
indexer_latency_p95_ms 48.0000

# HELP indexer_ledger_lag Difference between network ledger and last indexed ledger
# TYPE indexer_ledger_lag gauge
indexer_ledger_lag 2

# HELP indexer_healthy 1 if indexer is healthy, 0 otherwise
# TYPE indexer_healthy gauge
indexer_healthy 1
```

#### Metric reference

| Metric                        | Type    | Description                                                                                   |
| ----------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| `indexer_events_total`        | counter | Events processed, labelled by `type` (one series per event type, see table below)            |
| `indexer_processed_total`     | counter | Total events processed across all types                                                       |
| `indexer_errors_total`        | counter | Total processing failures                                                                     |
| `indexer_error_rate_percent`  | gauge   | `(failures / processed) × 100` — rolling failure rate                                        |
| `indexer_latency_avg_ms`      | gauge   | Exponential moving average (α = 0.1) of per-event processing latency                         |
| `indexer_latency_p95_ms`      | gauge   | 95th-percentile latency over a 60-second sliding window (up to 500 samples)                  |
| `indexer_ledger_lag`          | gauge   | `networkLedger − lastIndexedLedger`; 0 when either value is unknown                          |
| `indexer_healthy`             | gauge   | `1` = healthy; `0` = degraded (≥ 5 consecutive processing errors)                            |

#### Event types (`indexer_events_total{type=…}`)

| Type                   | Contract event              |
| ---------------------- | --------------------------- |
| `player_registered`    | `player_registered`         |
| `milestone_approved`   | `milestone_approved`        |
| `milestone_revoked`    | `milestone_revoked`         |
| `scout_subscribed`     | `scout_subscribed`          |
| `player_contacted`     | `player_contacted`          |
| `trial_offer_logged`   | `trial_offer_logged`        |
| `fees_withdrawn`       | `fees_withdrawn`            |

## Prometheus scrape config example

```yaml
scrape_configs:
  - job_name: scoutoff_indexer
    static_configs:
      - targets: ['localhost:3001']
```

## Tests

```bash
# From repo root
npx jest packages/indexer --no-coverage
```
