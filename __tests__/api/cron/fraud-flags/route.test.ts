/** @jest-environment node */
jest.mock('@/lib/fraudFlagsRunner', () => ({
  runFraudFlagEvaluation: jest.fn(),
}));

import { GET } from '@/app/api/cron/fraud-flags/route';
import { NextRequest } from 'next/server';
import { runFraudFlagEvaluation } from '@/lib/fraudFlagsRunner';
import { FraudFlagsStore } from '@/lib/fraudFlagsStore';
import type { FraudFlag } from '@/types';

const mockRunEvaluation = runFraudFlagEvaluation as jest.Mock;

function makeRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers['authorization'] = authHeader;
  return new NextRequest('http://localhost/api/cron/fraud-flags', {
    headers,
  });
}

function flag(severity: FraudFlag['severity']): FraudFlag {
  return {
    id: 'x',
    category: 'referral',
    heuristic: 'test',
    severity,
    wallets: ['GSOMEONE'],
    reason: 'test',
    evidence: {},
  };
}

beforeEach(() => {
  FraudFlagsStore.resetInstance();
  jest.clearAllMocks();
  mockRunEvaluation.mockResolvedValue({ flags: [], warnings: [] });
});

afterEach(() => {
  FraudFlagsStore.resetInstance();
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/fraud-flags', () => {
  it('returns 500 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest('Bearer anything'));
    expect(res.status).toBe(500);
    expect(mockRunEvaluation).not.toHaveBeenCalled();
  });

  it('returns 403 without an authorization header', async () => {
    process.env.CRON_SECRET = 'topsecret';
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(mockRunEvaluation).not.toHaveBeenCalled();
  });

  it('returns 403 for a mismatched bearer token', async () => {
    process.env.CRON_SECRET = 'topsecret';
    const res = await GET(makeRequest('Bearer wrong'));
    expect(res.status).toBe(403);
    expect(mockRunEvaluation).not.toHaveBeenCalled();
  });

  it('runs evaluation and persists the result for a valid bearer token', async () => {
    process.env.CRON_SECRET = 'topsecret';
    mockRunEvaluation.mockResolvedValue({
      flags: [flag('high'), flag('low')],
      warnings: ['some warning'],
    });

    const res = await GET(makeRequest('Bearer topsecret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flagCount).toBe(2);
    expect(body.highSeverityCount).toBe(1);

    const latest = FraudFlagsStore.getInstance().getLatestRun();
    expect(latest?.trigger).toBe('cron');
    expect(latest?.highSeverityCount).toBe(1);
  });
});
