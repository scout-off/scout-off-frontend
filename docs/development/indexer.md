# Indexer

Running and monitoring the event indexer in `packages/indexer`. See [packages/indexer/README.md](../../packages/indexer/README.md) for the package itself.

## Indexer HTTP API (Issue #29)

`packages/indexer/` runs an HTTP server alongside the event poller. Two endpoints are exposed on the port configured by `PORT` (default `3001`):

| Endpoint                      | Format     | Purpose                                                                                                                                                                                                                                            |
| ----------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health`                     | JSON       | Liveness probe. Returns `{ status, lastLedger, uptime }`. `status` flips to `"degraded"` when the poller hasn't seen a fresh ledger entry in 60s.                                                                                                  |
| `/metrics`                    | Prometheus | Pull-format counter/gauge metrics: `indexer_events_total{type=...}`, `indexer_processed_total`, `indexer_errors_total`, `indexer_error_rate_percent`, `indexer_latency_avg_ms`, `indexer_latency_p95_ms`, `indexer_ledger_lag`, `indexer_healthy`. |
| `/events`                     | JSON       | Query contract events. Supports `?type=...&limit=...&before=...`.                                                                                                                                                                                  |
| `/players/:id/events`         | JSON       | Same shape, scoped to a single player.                                                                                                                                                                                                             |
| `/validators/:address/events` | JSON       | Same shape, scoped to a single validator (filter by `validator` field on the event).                                                                                                                                                               |

### Quick verification

```bash
# Start the indexer (from repo root, against your testnet deploy):
npm run start --workspace=packages/indexer

# In another terminal, hit the endpoints:
curl -s http://localhost:3001/health | jq
curl -s http://localhost:3001/metrics | head -40
```

### Wiring into a metrics dashboard

- **Prometheus:** add `packages/indexer` to your Prometheus scrape config with `scrape_interval: 15s` and a target of `http://<indexer-host>:3001/metrics`. The metric names are stable and the `indexer_healthy` gauge is the canonical "is the indexer alive in production" signal.
- **Grafana:** the labels (`type=...`) on `indexer_events_total` let you chart per-event-type throughput directly. The `indexer_ledger_lag` gauge is the one to alert on — a sustained lag above ~50 means the indexer can't keep up with ledger close times.
- **Uptime monitors:** point them at `/health`. Anything non-200 OR `status: "degraded"` should page.
