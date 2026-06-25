/**
 * @jest-environment node
 */
import { IndexerMetrics } from '../IndexerMetrics';
import type { EventType } from '../IndexerMetrics';

// Fixed clock for deterministic tests
let fakeClock = 0;
const now = () => fakeClock;

beforeEach(() => {
  fakeClock = 0;
  IndexerMetrics.resetInstance();
});

afterEach(() => {
  IndexerMetrics.resetInstance();
});

describe('IndexerMetrics — initialization', () => {
  test('snapshot returns zero values on a fresh instance', () => {
    const metrics = IndexerMetrics.getInstance(now);
    const snap = metrics.snapshot();

    expect(snap.totalProcessed).toBe(0);
    expect(snap.totalSuccesses).toBe(0);
    expect(snap.totalFailures).toBe(0);
    expect(snap.totalRetries).toBe(0);
    expect(snap.totalBytesIngested).toBe(0);
    expect(snap.consecutiveErrors).toBe(0);
    expect(snap.isHealthy).toBe(true);
    expect(snap.lastProcessedAt).toBeNull();
    expect(snap.ingestionRatePerSec).toBe(0);
    expect(snap.errorRatePercent).toBe(0);
    expect(snap.successRatePercent).toBe(0);
    expect(snap.latencyAvgMs).toBe(0);
    expect(snap.latencyP95Ms).toBe(0);
    expect(snap.throughputBytesPerSec).toBe(0);
  });

  test('getInstance returns the same singleton', () => {
    const a = IndexerMetrics.getInstance(now);
    const b = IndexerMetrics.getInstance(now);
    expect(a).toBe(b);
  });

  test('resetInstance allows creating a new singleton', () => {
    const a = IndexerMetrics.getInstance(now);
    IndexerMetrics.resetInstance();
    const b = IndexerMetrics.getInstance(now);
    expect(a).not.toBe(b);
  });

  test('all eventCounts are initialized to zero', () => {
    const metrics = IndexerMetrics.getInstance(now);
    const snap = metrics.snapshot();
    const eventTypes: EventType[] = [
      'player_registered',
      'milestone_approved',
      'milestone_revoked',
      'scout_subscribed',
      'player_contacted',
      'trial_offer_logged',
      'fees_withdrawn',
    ];
    for (const t of eventTypes) {
      expect(snap.eventCounts[t]).toBe(0);
    }
  });
});

describe('IndexerMetrics — recordSuccess', () => {
  test('increments totalProcessed, totalSuccesses, and eventCount', () => {
    const metrics = IndexerMetrics.getInstance(now);
    metrics.recordSuccess('player_registered', 10, 128);
    const snap = metrics.snapshot();

    expect(snap.totalProcessed).toBe(1);
    expect(snap.totalSuccesses).toBe(1);
    expect(snap.totalFailures).toBe(0);
    expect(snap.eventCounts.player_registered).toBe(1);
  });

  test('accumulates totalBytesIngested', () => {
    const metrics = IndexerMetrics.getInstance(now);
    metrics.recordSuccess('milestone_approved', 5, 100);
    metrics.recordSuccess('scout_subscribed', 5, 200);
    expect(metrics.snapshot().totalBytesIngested).toBe(300);
  });

  test('sets lastProcessedAt to current clock value', () => {
    fakeClock = 12345;
    const metrics = IndexerMetrics.getInstance(now);
    metrics.recordSuccess('player_contacted', 10);
    expect(metrics.snapshot().lastProcessedAt).toBe(12345);
  });

  test('resets consecutiveErrors to 0', () => {
    const metrics = IndexerMetrics.getInstance(now);
    metrics.recordFailure();
    metrics.recordFailure();
    metrics.recordSuccess('fees_withdrawn', 10);
    expect(metrics.snapshot().consecutiveErrors).toBe(0);
  });

  test('seeds EMA with first sample latency', () => {
    const metrics = IndexerMetrics.getInstance(now);
    metrics.recordSuccess('player_registered', 50);
    expect(metrics.snapshot().latencyAvgMs).toBe(50);
  });

  test('EMA converges toward new latency over many samples', () => {
    const metrics = IndexerMetrics.getInstance(now);
    // Seed at 100 ms
    metrics.recordSuccess('player_registered', 100);
    // Record 50 events at 0 ms — EMA should decrease substantially
    for (let i = 0; i < 50; i++) {
      fakeClock += 1;
      metrics.recordSuccess('player_registered', 0);
    }
    expect(metrics.snapshot().latencyAvgMs).toBeLessThan(10);
  });
});

describe('IndexerMetrics — recordFailure', () => {
  test('increments totalProcessed and totalFailures', () => {
    const metrics = IndexerMetrics.getInstance(now);
    metrics.recordFailure(20);
    const snap = metrics.snapshot();

    expect(snap.totalProcessed).toBe(1);
    expect(snap.totalFailures).toBe(1);
    expect(snap.totalSuccesses).toBe(0);
  });

  test('increments consecutiveErrors on each failure', () => {
    const metrics = IndexerMetrics.getInstance(now);
    metrics.recordFailure();
    metrics.recordFailure();
    metrics.recordFailure();
    expect(metrics.snapshot().consecutiveErrors).toBe(3);
  });

  test('marks isHealthy = false after 5 consecutive errors', () => {
    const metrics = IndexerMetrics.getInstance(now);
    for (let i = 0; i < 5; i++) {
      metrics.recordFailure();
    }
    expect(metrics.snapshot().isHealthy).toBe(false);
  });

  test('isHealthy remains true with fewer than 5 consecutive errors', () => {
    const metrics = IndexerMetrics.getInstance(now);
    for (let i = 0; i < 4; i++) {
      metrics.recordFailure();
    }
    expect(metrics.snapshot().isHealthy).toBe(true);
  });
});

describe('IndexerMetrics — recordRetry', () => {
  test('increments totalRetries without affecting processed count', () => {
    const metrics = IndexerMetrics.getInstance(now);
    metrics.recordRetry();
    metrics.recordRetry();
    const snap = metrics.snapshot();
    expect(snap.totalRetries).toBe(2);
    expect(snap.totalProcessed).toBe(0);
  });
});

describe('IndexerMetrics — markHealthy', () => {
  test('restores isHealthy and resets consecutiveErrors', () => {
    const metrics = IndexerMetrics.getInstance(now);
    for (let i = 0; i < 10; i++) {
      metrics.recordFailure();
    }
    expect(metrics.snapshot().isHealthy).toBe(false);
    metrics.markHealthy();
    const snap = metrics.snapshot();
    expect(snap.isHealthy).toBe(true);
    expect(snap.consecutiveErrors).toBe(0);
  });
});

describe('IndexerMetrics — rate calculations', () => {
  test('errorRatePercent is (failures / processed) * 100', () => {
    const metrics = IndexerMetrics.getInstance(now);
    metrics.recordSuccess('player_registered', 10);
    metrics.recordSuccess('player_registered', 10);
    metrics.recordFailure();
    // 1 failure / 3 total = 33.33%
    const snap = metrics.snapshot();
    expect(snap.errorRatePercent).toBeCloseTo(33.33, 1);
  });

  test('successRatePercent is (successes / processed) * 100', () => {
    const metrics = IndexerMetrics.getInstance(now);
    metrics.recordSuccess('player_registered', 10);
    metrics.recordSuccess('player_registered', 10);
    metrics.recordFailure();
    expect(metrics.snapshot().successRatePercent).toBeCloseTo(66.67, 1);
  });

  test('ingestionRatePerSec returns positive value for events in window', () => {
    const metrics = IndexerMetrics.getInstance(now);
    fakeClock = 0;
    metrics.recordSuccess('player_registered', 5);
    fakeClock = 1000; // 1 second later
    metrics.recordSuccess('player_registered', 5);
    fakeClock = 2000; // 2 seconds later
    // 2 events over ~2000ms window → ~1 event/sec
    expect(metrics.snapshot().ingestionRatePerSec).toBeGreaterThan(0);
  });

  test('ingestionRatePerSec is 0 when no events in window', () => {
    const metrics = IndexerMetrics.getInstance(now);
    // Record events then advance clock past the 60s window
    fakeClock = 0;
    metrics.recordSuccess('player_registered', 5);
    fakeClock = 70_000; // 70 seconds later — outside 60s window
    expect(metrics.snapshot().ingestionRatePerSec).toBe(0);
  });

  test('throughputBytesPerSec returns positive value for bytes in window', () => {
    const metrics = IndexerMetrics.getInstance(now);
    fakeClock = 0;
    metrics.recordSuccess('player_registered', 5, 1000);
    fakeClock = 1000;
    metrics.recordSuccess('milestone_approved', 5, 2000);
    fakeClock = 2000;
    expect(metrics.snapshot().throughputBytesPerSec).toBeGreaterThan(0);
  });
});

describe('IndexerMetrics — latency percentiles', () => {
  test('latencyP95Ms returns 95th percentile of window latencies', () => {
    const metrics = IndexerMetrics.getInstance(now);
    // 20 events with increasing latency: 10, 20, ..., 200
    for (let i = 1; i <= 20; i++) {
      fakeClock = i * 100;
      metrics.recordSuccess('player_registered', i * 10);
    }
    const snap = metrics.snapshot();
    // p95 of [10,20,...,200]: index = ceil(20 * 0.95) - 1 = 18, value = 190
    expect(snap.latencyP95Ms).toBe(190);
  });

  test('latencyP95Ms is 0 when window is empty', () => {
    const metrics = IndexerMetrics.getInstance(now);
    expect(metrics.snapshot().latencyP95Ms).toBe(0);
  });
});

describe('IndexerMetrics — snapshot isolation', () => {
  test('snapshot eventCounts is a copy, not a reference', () => {
    const metrics = IndexerMetrics.getInstance(now);
    metrics.recordSuccess('player_registered', 10);
    const snap = metrics.snapshot();
    // Mutating the snapshot should not affect internal state
    snap.eventCounts.player_registered = 999;
    expect(metrics.snapshot().eventCounts.player_registered).toBe(1);
  });
});

describe('IndexerMetrics — sliding window eviction', () => {
  test('window is bounded and old events are evicted on overflow', () => {
    const metrics = IndexerMetrics.getInstance(now);
    // Record 600 events (> WINDOW_SIZE=500) at the same timestamp
    for (let i = 0; i < 600; i++) {
      fakeClock = i;
      metrics.recordSuccess('player_registered', 1);
    }
    // Should not throw; totalProcessed should equal 600
    expect(metrics.snapshot().totalProcessed).toBe(600);
    // Ingestion rate should still be computable
    expect(metrics.snapshot().ingestionRatePerSec).toBeGreaterThan(0);
  });
});
