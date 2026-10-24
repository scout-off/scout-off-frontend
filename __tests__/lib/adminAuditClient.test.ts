import {
  fetchAuditLog,
  fetchReconciliation,
  fetchReconciliationHistory,
  recordAuditEntry,
} from '@/lib/adminAuditClient';
import { fetchWithRetry } from '@/lib/fetchWithRetry';

jest.mock('@/lib/fetchWithRetry', () => ({
  ...jest.requireActual('@/lib/fetchWithRetry'),
  fetchWithRetry: jest.fn(),
}));

const mockFetchWithRetry = fetchWithRetry as jest.MockedFunction<
  typeof fetchWithRetry
>;

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe('adminAuditClient', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    mockFetchWithRetry.mockReset();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  describe('fetchAuditLog', () => {
    it('GETs the log with no query string by default', async () => {
      const result = { entries: [], nextCursor: null };
      mockFetchWithRetry.mockResolvedValue(response(result));
      await expect(fetchAuditLog()).resolves.toEqual(result);
      expect(mockFetchWithRetry).toHaveBeenCalledWith('/api/admin/audit-log');
    });

    it('serializes every provided filter', async () => {
      mockFetchWithRetry.mockResolvedValue(response({ entries: [] }));
      await fetchAuditLog({
        actionType: 'pause_contract',
        from: 10,
        to: 20,
        before: 5,
        limit: 50,
      } as Parameters<typeof fetchAuditLog>[0]);
      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        '/api/admin/audit-log?actionType=pause_contract&from=10&to=20&before=5&limit=50',
      );
    });

    it('surfaces the server error message', async () => {
      mockFetchWithRetry.mockResolvedValue(
        response({ error: 'Forbidden' }, false, 403),
      );
      await expect(fetchAuditLog()).rejects.toThrow('Forbidden');
    });

    it('falls back to a generic message for unreadable error bodies', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('bad json');
        },
      } as unknown as Response);
      await expect(fetchAuditLog()).rejects.toThrow(
        'Failed to fetch audit log',
      );
    });
  });

  describe('recordAuditEntry', () => {
    const entry = {
      actionType: 'pause_contract',
      status: 'submitted',
      txHash: 'abc',
    } as Parameters<typeof recordAuditEntry>[0];

    it('POSTs the entry with a bare fetch (no automatic retry)', async () => {
      fetchMock.mockResolvedValue(response({}));
      await recordAuditEntry(entry);
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      expect(mockFetchWithRetry).not.toHaveBeenCalled();
    });

    it('throws when the entry is rejected', async () => {
      fetchMock.mockResolvedValue(response({}, false, 500));
      await expect(recordAuditEntry(entry)).rejects.toThrow(
        'Failed to record audit log entry',
      );
    });
  });

  describe('fetchReconciliation', () => {
    it('returns the reconciliation result', async () => {
      const result = { matched: 3, missing: [] };
      mockFetchWithRetry.mockResolvedValue(response(result));
      await expect(fetchReconciliation()).resolves.toEqual(result);
      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        '/api/admin/audit-log/reconcile',
      );
    });

    it('throws on failure', async () => {
      mockFetchWithRetry.mockResolvedValue(response({}, false, 500));
      await expect(fetchReconciliation()).rejects.toThrow(
        'Failed to run reconciliation',
      );
    });
  });

  describe('fetchReconciliationHistory', () => {
    it('unwraps runs and passes an optional limit', async () => {
      const runs = [{ id: 1 }];
      mockFetchWithRetry.mockResolvedValue(response({ runs }));

      await expect(fetchReconciliationHistory(5)).resolves.toEqual(runs);
      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        '/api/admin/audit-log/reconcile/history?limit=5',
      );

      await fetchReconciliationHistory();
      expect(mockFetchWithRetry).toHaveBeenLastCalledWith(
        '/api/admin/audit-log/reconcile/history',
      );
    });

    it('throws on failure', async () => {
      mockFetchWithRetry.mockResolvedValue(response({}, false, 500));
      await expect(fetchReconciliationHistory()).rejects.toThrow(
        'Failed to fetch reconciliation history',
      );
    });
  });
});
