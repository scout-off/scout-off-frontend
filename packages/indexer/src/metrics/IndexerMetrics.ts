/**
 * IndexerMetrics — lightweight, zero-dependency metrics for the ScoutOff indexer.
 *
 * Tracks ingestion rate, error rate, processing latency, throughput, success/failure
 * counts, retry counts, and general indexer health indicators.
 *
 * Design constraints:
 *  - No external dependencies (no prom-client); plain TypeScript counters/gauges.
 *  - Singleton instance to prevent duplicate registrations.
 *  - No high-cardinality labels; only low-cardinality event types are accepted.
 *  - Fixed-size sliding window for rate calculations to bound memory growth.
 */

export type EventType =
  | 'player_registered'
  | 'milestone_approved'
  | 'milestone_revoked'
  | 'scout_subscribed'
  | 'player_contacted'
  | 'trial_offer_logged'
  | 'fees_withdrawn';

export interface MetricSnapshot {
  // Counters
  totalProcessed: number;
  totalSuccesses: number;
  totalFailures: number;
  totalRetries: number;
  totalBytesIngested: number;
  eventCounts: Record<EventType, number>;

  // Gauges
  lastProcessedAt: number | null; // Unix ms
  consecutiveErrors: number;
  isHealthy: boolean;

  // Rates (computed over sliding window)
  ingestionRatePerSec: number; // events / sec over last window
  errorRatePercent: number; // (failures / processed) * 100
  successRatePercent: number; // (successes / processed) * 100

  // Latency (ms) – exponential moving average + p95 over window
  latencyAvgMs: number;
  latencyP95Ms: number;

  // Throughput
  throughputBytesPerSec: number;
}

/** Internal sliding-window entry for rate/latency calculations. */
interface WindowEntry {
  timestampMs: number;
  latencyMs: number;
  success: boolean;
  bytes: number;
}

/** Maximum entries kept in the sliding window (bounded memory). */
const WINDOW_SIZE = 500;

/** Sliding-window duration in milliseconds (60 s). */
const WINDOW_DURATION_MS = 60_000;

/** EMA smoothing factor α ∈ (0, 1]: smaller = smoother. */
const EMA_ALPHA = 0.1;

export class IndexerMetrics {
  private static _instance: IndexerMetrics | null = null;

  // Counters
  private _totalProcessed = 0;
  private _totalSuccesses = 0;
  private _totalFailures = 0;
  private _totalRetries = 0;
  private _totalBytesIngested = 0;
  private _eventCounts: Record<EventType, number> = {
    player_registered: 0,
    milestone_approved: 0,
    milestone_revoked: 0,
    scout_subscribed: 0,
    player_contacted: 0,
    trial_offer_logged: 0,
    fees_withdrawn: 0,
  };

  // Gauges
  private _lastProcessedAt: number | null = null;
  private _consecutiveErrors = 0;
  private _isHealthy = true;

  // EMA latency
  private _latencyEmaMs = 0;

  // Sliding window
  private _window: WindowEntry[] = [];

  // Allow injecting a clock (for testing)
  private _now: () => number;

  private constructor(now: () => number = Date.now) {
    this._now = now;
  }

  /** Returns the singleton instance. Pass `now` only when creating for the first time. */
  static getInstance(now?: () => number): IndexerMetrics {
    if (!IndexerMetrics._instance) {
      IndexerMetrics._instance = new IndexerMetrics(now ?? Date.now);
    }
    return IndexerMetrics._instance;
  }

  /**
   * Resets the singleton. Use ONLY in tests to isolate state between cases.
   */
  static resetInstance(): void {
    IndexerMetrics._instance = null;
  }

  // ── Recording API ────────────────────────────────────────────────────────────

  /**
   * Record a successfully processed event.
   *
   * @param type      - The on-chain event type.
   * @param latencyMs - Wall-clock processing time in milliseconds.
   * @param bytes     - Approximate payload size in bytes (0 if unknown).
   */
  recordSuccess(type: EventType, latencyMs: number, bytes = 0): void {
    const ts = this._now();
    this._totalProcessed++;
    this._totalSuccesses++;
    this._totalBytesIngested += bytes;
    this._eventCounts[type]++;
    this._lastProcessedAt = ts;
    this._consecutiveErrors = 0;
    this._isHealthy = true;

    this._updateLatencyEma(latencyMs);
    this._pushWindow({ timestampMs: ts, latencyMs, success: true, bytes });
  }

  /**
   * Record a failed event processing attempt.
   *
   * @param latencyMs - Time spent before failure, in milliseconds.
   */
  recordFailure(latencyMs = 0): void {
    const ts = this._now();
    this._totalProcessed++;
    this._totalFailures++;
    this._lastProcessedAt = ts;
    this._consecutiveErrors++;

    // Mark unhealthy after 5 consecutive errors.
    if (this._consecutiveErrors >= 5) {
      this._isHealthy = false;
    }

    this._updateLatencyEma(latencyMs);
    this._pushWindow({ timestampMs: ts, latencyMs, success: false, bytes: 0 });
  }

  /**
   * Record a retry attempt (without counting as a new processed event).
   */
  recordRetry(): void {
    this._totalRetries++;
  }

  /**
   * Mark the indexer as healthy (e.g., after a successful reconnection).
   */
  markHealthy(): void {
    this._isHealthy = true;
    this._consecutiveErrors = 0;
  }

  // ── Snapshot ─────────────────────────────────────────────────────────────────

  /** Returns an immutable snapshot of current metrics. */
  snapshot(): MetricSnapshot {
    const now = this._now();
    const window = this._getActiveWindow(now);

    const ingestionRatePerSec = this._computeIngestionRate(window, now);
    const throughputBytesPerSec = this._computeThroughput(window, now);
    const latencyP95Ms = this._computeP95(window);

    const errorRatePercent =
      this._totalProcessed > 0
        ? (this._totalFailures / this._totalProcessed) * 100
        : 0;
    const successRatePercent =
      this._totalProcessed > 0
        ? (this._totalSuccesses / this._totalProcessed) * 100
        : 0;

    return {
      totalProcessed: this._totalProcessed,
      totalSuccesses: this._totalSuccesses,
      totalFailures: this._totalFailures,
      totalRetries: this._totalRetries,
      totalBytesIngested: this._totalBytesIngested,
      eventCounts: { ...this._eventCounts },
      lastProcessedAt: this._lastProcessedAt,
      consecutiveErrors: this._consecutiveErrors,
      isHealthy: this._isHealthy,
      ingestionRatePerSec,
      errorRatePercent,
      successRatePercent,
      latencyAvgMs: this._latencyEmaMs,
      latencyP95Ms,
      throughputBytesPerSec,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _updateLatencyEma(latencyMs: number): void {
    if (this._totalProcessed === 1) {
      // First sample: seed the EMA.
      this._latencyEmaMs = latencyMs;
    } else {
      this._latencyEmaMs =
        EMA_ALPHA * latencyMs + (1 - EMA_ALPHA) * this._latencyEmaMs;
    }
  }

  private _pushWindow(entry: WindowEntry): void {
    this._window.push(entry);
    // Evict oldest entries when window exceeds max size.
    if (this._window.length > WINDOW_SIZE) {
      this._window.shift();
    }
  }

  private _getActiveWindow(now: number): WindowEntry[] {
    const cutoff = now - WINDOW_DURATION_MS;
    return this._window.filter((e) => e.timestampMs >= cutoff);
  }

  private _computeIngestionRate(window: WindowEntry[], now: number): number {
    if (window.length === 0) return 0;
    const oldest = window[0].timestampMs;
    const spanMs = Math.max(now - oldest, 1);
    return (window.length / spanMs) * 1000;
  }

  private _computeThroughput(window: WindowEntry[], now: number): number {
    if (window.length === 0) return 0;
    const totalBytes = window.reduce((sum, e) => sum + e.bytes, 0);
    const oldest = window[0].timestampMs;
    const spanMs = Math.max(now - oldest, 1);
    return (totalBytes / spanMs) * 1000;
  }

  private _computeP95(window: WindowEntry[]): number {
    if (window.length === 0) return 0;
    const sorted = window.map((e) => e.latencyMs).sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(idx, 0)];
  }
}
