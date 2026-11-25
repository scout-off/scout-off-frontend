/**
 * Lightweight Prometheus-style metrics for the indexer.
 *
 * Kept dependency-free so it can be imported from both the SQLite and
 * Postgres code paths without pulling in a metrics library.
 */

export interface IndexerMetrics {
  /** Total events ingested since process start. */
  eventsIngested: number;
  /** Total batches committed since process start. */
  batchesCommitted: number;
  /** Number of currently connected SSE subscribers (gauge). */
  sseSubscribers: number;
  /**
   * Most recent commit -> dispatch lag in milliseconds (gauge).
   * Populated by the cross-replica LISTEN/NOTIFY fan-out path.
   */
  sseDispatchLagMs: number;
  /** Total SSE events dispatched to local subscribers. */
  sseEventsDispatched: number;
  /** Total times the LISTEN connection was (re-)established. */
  sseListenReconnects: number;
}

const metrics: IndexerMetrics = {
  eventsIngested: 0,
  batchesCommitted: 0,
  sseSubscribers: 0,
  sseDispatchLagMs: 0,
  sseEventsDispatched: 0,
  sseListenReconnects: 0,
};

export function getMetrics(): IndexerMetrics {
  return metrics;
}

export function incEventsIngested(count: number): void {
  metrics.eventsIngested += count;
}

export function incBatchesCommitted(): void {
  metrics.batchesCommitted += 1;
}

export function setSseSubscribers(count: number): void {
  metrics.sseSubscribers = count;
}

export function incSseSubscribers(delta: number): void {
  metrics.sseSubscribers += delta;
  if (metrics.sseSubscribers < 0) metrics.sseSubscribers = 0;
}

export function observeSseDispatchLag(lagMs: number): void {
  metrics.sseDispatchLagMs = lagMs;
}

export function incSseEventsDispatched(count: number): void {
  metrics.sseEventsDispatched += count;
}

export function incSseListenReconnects(): void {
  metrics.sseListenReconnects += 1;
}

/**
 * Render metrics in Prometheus text exposition format for `/metrics`.
 */
export function renderMetrics(): string {
  const lines: string[] = [];
  lines.push('# HELP indexer_events_ingested_total Total events ingested.');
  lines.push('# TYPE indexer_events_ingested_total counter');
  lines.push(`indexer_events_ingested_total ${metrics.eventsIngested}`);

  lines.push('# HELP indexer_batches_committed_total Total batches committed.');
  lines.push('# TYPE indexer_batches_committed_total counter');
  lines.push(`indexer_batches_committed_total ${metrics.batchesCommitted}`);

  lines.push('# HELP indexer_sse_subscribers Current SSE subscribers.');
  lines.push('# TYPE indexer_sse_subscribers gauge');
  lines.push(`indexer_sse_subscribers ${metrics.sseSubscribers}`);

  lines.push('# HELP indexer_sse_dispatch_lag_ms Commit to dispatch lag in ms.');
  lines.push('# TYPE indexer_sse_dispatch_lag_ms gauge');
  lines.push(`indexer_sse_dispatch_lag_ms ${metrics.sseDispatchLagMs}`);

  lines.push('# HELP indexer_sse_events_dispatched_total Total SSE events dispatched.');
  lines.push('# TYPE indexer_sse_events_dispatched_total counter');
  lines.push(`indexer_sse_events_dispatched_total ${metrics.sseEventsDispatched}`);

  lines.push('# HELP indexer_sse_listen_reconnects_total Total LISTEN reconnects.');
  lines.push('# TYPE indexer_sse_listen_reconnects_total counter');
  lines.push(`indexer_sse_listen_reconnects_total ${metrics.sseListenReconnects}`);

  return lines.join('\n') + '\n';
}
