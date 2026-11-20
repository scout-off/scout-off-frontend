# API Observability and SLOs

API route spans are created by `withRouteTelemetry` in `lib/telemetry.ts`. Each server span records the normalized route name, request ID, HTTP status class, and duration. The instrumented critical paths represent Pinata, IPFS gateway, and backend work as child spans. Wallet addresses, contact details, authorization values, and other sensitive attribute keys are redacted before they reach Sentry.

## Critical-path SLOs

| Route or measurement                  | SLO          | Alert threshold                                                                      |
| ------------------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| `/api/auth/sep10` POST latency        | p95 < 800 ms | page when p95 is >= 800 ms for 15 minutes                                            |
| `/api/media/[cid]` time to first byte | p95 < 1.5 s  | page when p95 is >= 1.5 s for 15 minutes                                             |
| Critical API route errors             | < 1%         | page when the 5-minute rolling error rate is >= 1%; ticket at >= 0.5% for 30 minutes |

Sentry Performance provides the route duration and child-span distributions. Filter transactions by the normalized route name and use the `http.status_class` tag for RED error-rate calculations. The media gateway read-ahead span records `http.ttfb_ms`, so gateway fallback behavior and time to first byte can be compared independently from total route duration.

## Sampling and operations

Sentry traces are sampled at 10% in production and 100% in non-production environments where Sentry is enabled. Error events remain unsampled. Alerts should use the SLO windows above and group by normalized route, never by a URL containing a CID, wallet address, email, or other user-controlled identifier.

The admin health view can link to these Sentry Performance queries for p50/p95 route latency, dependency timing, and error rate. This keeps the health view's availability check separate from the latency and reliability objectives.

---

# ScoutOff Indexer — Observability & SLOs

## Metrics endpoint

The indexer exposes metrics in **Prometheus exposition format 0.0.4** at `GET /metrics`.

### Protection

| Mode | Config | Behaviour |
|---|---|---|
| Separate internal port | `METRICS_PORT=9091` | `/metrics` is served only on port 9091, which docker-compose does not publish to the host. The main port (3001) returns 404 for `/metrics`. |
| Bearer token | `METRICS_BEARER_TOKEN=<secret>` | `/metrics` on the main port requires `Authorization: Bearer <token>`. Requests without a valid token receive `401`. The token comparison is constant-time. |
| Both | Set both env vars | Recommended for defence in depth: internal port restricts network access, token protects against SSRF. |

The Next.js frontend proxy (`app/api/indexer/[...path]`) permanently blocks `/metrics` with a 404 regardless of the above settings.

### Content negotiation

| `Accept` header | Response |
|---|---|
| _(absent or anything else)_ | `text/plain; version=0.0.4` — Prometheus format |
| `application/json` | `application/json` — raw `MetricSnapshot` JSON |

### Prometheus scrape config

```yaml
scrape_configs:
  - job_name: scoutoff_indexer
    static_configs:
      - targets: ['indexer:9091']   # internal metrics port
```

If using bearer-token auth instead of a separate port:

```yaml
scrape_configs:
  - job_name: scoutoff_indexer
    static_configs:
      - targets: ['indexer:3001']
    authorization:
      credentials: <METRICS_BEARER_TOKEN value>
```

---

## Metric reference

All metrics use the `scoutoff_indexer_` prefix per Prometheus naming conventions.

| Metric | Type | Description |
|---|---|---|
| `scoutoff_indexer_events_total{type="…"}` | counter | Events processed, labelled by contract event type |
| `scoutoff_indexer_processed_total` | counter | Total events processed across all types |
| `scoutoff_indexer_errors_total` | counter | Total processing failures |
| `scoutoff_indexer_error_rate_percent` | gauge | `(failures / processed) × 100` |
| `scoutoff_indexer_latency_avg_ms` | gauge | Exponential moving average (α=0.1) of processing latency in ms |
| `scoutoff_indexer_latency_p95_ms` | gauge | 95th-percentile latency over the 60 s sliding window |
| `scoutoff_indexer_ledger_lag` | gauge | `networkLedger − lastIndexedLedger`; 0 when either is unknown |
| `scoutoff_indexer_healthy` | gauge | `1` = healthy, `0` = degraded (≥ 5 consecutive errors) |

---

## Indexer SLOs

### Availability
**SLO:** ≥ 99.5 % of `/health` requests over a 30-day rolling window return `{"status":"ok"}`.

Alert condition:
```promql
(
  sum_over_time(scoutoff_indexer_healthy[30d]) /
  count_over_time(scoutoff_indexer_healthy[30d])
) < 0.995
```

### Ledger lag
**SLO:** `scoutoff_indexer_ledger_lag` stays below 10 ledgers for 99 % of measurements over any 1-hour window.

Alert condition:
```promql
histogram_quantile(0.99,
  sum(rate(scoutoff_indexer_ledger_lag[1h])) by (le)
) > 10
```

### Error rate
**SLO:** `scoutoff_indexer_error_rate_percent` stays below 1 % as a 5-minute average.

Alert condition:
```promql
avg_over_time(scoutoff_indexer_error_rate_percent[5m]) > 1
```

### Processing latency (p95)
**SLO:** `scoutoff_indexer_latency_p95_ms` stays below 500 ms as a 5-minute average.

Alert condition:
```promql
avg_over_time(scoutoff_indexer_latency_p95_ms[5m]) > 500
```
