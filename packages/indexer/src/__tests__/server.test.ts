/**
 * @jest-environment node
 */
import * as http from 'http';
import { IndexerMetrics } from '../metrics/IndexerMetrics';
import {
  updateLastLedger,
  updateNetworkLedger,
  resetLedgerState,
} from '../ledgerTracker';

// Import server after mocking so it uses our module state
import { server } from '../server';

function request(
  path: string,
): Promise<{ status: number; body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.get(`http://127.0.0.1:${addr.port}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          body,
          contentType: res.headers['content-type'] ?? '',
        }),
      );
    });
    req.on('error', reject);
  });
}

beforeAll((done) => {
  server.listen(0, done); // random port
});

afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  IndexerMetrics.resetInstance();
  resetLedgerState();
});

afterEach(() => {
  IndexerMetrics.resetInstance();
  resetLedgerState();
});

// ── /health ──────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('returns 200 with application/json', async () => {
    const { status, contentType } = await request('/health');
    expect(status).toBe(200);
    expect(contentType).toContain('application/json');
  });

  test('returns status ok and uptime when ledger is fresh', async () => {
    updateLastLedger(100);
    const { body } = await request('/health');
    const json = JSON.parse(body);
    expect(json.status).toBe('ok');
    expect(json.lastLedger).toBe(100);
    expect(typeof json.uptime).toBe('number');
  });

  test('returns status ok when ledger has never been set (timestamp=0)', async () => {
    // timestamp stays 0 — not stale, just unknown
    const { body } = await request('/health');
    const json = JSON.parse(body);
    expect(json.status).toBe('ok');
  });
});

// ── /metrics ─────────────────────────────────────────────────────────────────

describe('GET /metrics', () => {
  test('returns 200 with Prometheus content-type', async () => {
    const { status, contentType } = await request('/metrics');
    expect(status).toBe(200);
    expect(contentType).toContain('text/plain');
  });

  test('contains all four metric categories', async () => {
    const { body } = await request('/metrics');
    // Events
    expect(body).toContain('indexer_events_total');
    // Errors
    expect(body).toContain('indexer_errors_total');
    // Latency
    expect(body).toContain('indexer_latency_avg_ms');
    expect(body).toContain('indexer_latency_p95_ms');
    // Ledger lag
    expect(body).toContain('indexer_ledger_lag');
  });

  test('reflects recorded event counts', async () => {
    const metrics = IndexerMetrics.getInstance();
    metrics.recordSuccess('player_registered', 10);
    metrics.recordSuccess('player_registered', 20);
    metrics.recordSuccess('milestone_approved', 5);

    const { body } = await request('/metrics');
    expect(body).toContain('indexer_events_total{type="player_registered"} 2');
    expect(body).toContain('indexer_events_total{type="milestone_approved"} 1');
    expect(body).toContain('indexer_processed_total 3');
  });

  test('reflects error count', async () => {
    const metrics = IndexerMetrics.getInstance();
    metrics.recordFailure(10);
    metrics.recordFailure(10);

    const { body } = await request('/metrics');
    expect(body).toContain('indexer_errors_total 2');
  });

  test('reflects ledger lag', async () => {
    updateNetworkLedger(1050);
    updateLastLedger(1000);

    const { body } = await request('/metrics');
    expect(body).toContain('indexer_ledger_lag 50');
  });

  test('returns 0 lag when ledger values are unknown', async () => {
    // Neither updateLastLedger nor updateNetworkLedger called
    const { body } = await request('/metrics');
    expect(body).toContain('indexer_ledger_lag 0');
  });
});

// ── 404 ──────────────────────────────────────────────────────────────────────

describe('unknown routes', () => {
  test('returns 404 for unrecognised paths', async () => {
    const { status } = await request('/unknown');
    expect(status).toBe(404);
  });
});
