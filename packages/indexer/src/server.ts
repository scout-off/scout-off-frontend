import * as http from 'http';
import { IndexerMetrics } from './metrics/IndexerMetrics';
import { getLastLedgerInfo, getLedgerLag } from './ledgerTracker';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

const startTime = Date.now();

function handleHealth(res: http.ServerResponse): void {
  const { lastLedger, timestamp } = getLastLedgerInfo();
  const now = Date.now();
  const stale = timestamp > 0 && now - timestamp > 60_000;
  const uptimeSec = Math.floor((now - startTime) / 1000);
  const body = JSON.stringify({
    status: stale ? 'degraded' : 'ok',
    lastLedger,
    uptime: uptimeSec,
  });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(body);
}

function handleMetrics(res: http.ServerResponse): void {
  const snap = IndexerMetrics.getInstance().snapshot();
  const lag = getLedgerLag();

  const lines: string[] = [
    '# HELP indexer_events_total Total events processed by type',
    '# TYPE indexer_events_total counter',
    ...Object.entries(snap.eventCounts).map(
      ([type, count]) => `indexer_events_total{type="${type}"} ${count}`,
    ),
    '# HELP indexer_processed_total Total events processed (all types)',
    '# TYPE indexer_processed_total counter',
    `indexer_processed_total ${snap.totalProcessed}`,
    '# HELP indexer_errors_total Total processing failures',
    '# TYPE indexer_errors_total counter',
    `indexer_errors_total ${snap.totalFailures}`,
    '# HELP indexer_error_rate_percent Failure rate as a percentage',
    '# TYPE indexer_error_rate_percent gauge',
    `indexer_error_rate_percent ${snap.errorRatePercent.toFixed(4)}`,
    '# HELP indexer_latency_avg_ms Processing latency EMA in milliseconds',
    '# TYPE indexer_latency_avg_ms gauge',
    `indexer_latency_avg_ms ${snap.latencyAvgMs.toFixed(4)}`,
    '# HELP indexer_latency_p95_ms Processing latency p95 in milliseconds (sliding window)',
    '# TYPE indexer_latency_p95_ms gauge',
    `indexer_latency_p95_ms ${snap.latencyP95Ms.toFixed(4)}`,
    '# HELP indexer_ledger_lag Difference between network ledger and last indexed ledger',
    '# TYPE indexer_ledger_lag gauge',
    `indexer_ledger_lag ${lag}`,
    '# HELP indexer_healthy 1 if indexer is healthy, 0 otherwise',
    '# TYPE indexer_healthy gauge',
    `indexer_healthy ${snap.isHealthy ? 1 : 0}`,
  ];

  res.writeHead(200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
  });
  res.end(lines.join('\n') + '\n');
}

export const server = http.createServer(
  (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.method === 'GET' && req.url === '/health') {
      return handleHealth(res);
    }
    if (req.method === 'GET' && req.url === '/metrics') {
      return handleMetrics(res);
    }
    res.writeHead(404);
    res.end('Not Found');
  },
);

export function startServer(): void {
  server.listen(PORT, () => {
    console.log(`Indexer server listening on port ${PORT}`);
  });
}
