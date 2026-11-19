import {
  fetchAuditLog,
  fetchReconciliation,
  fetchReconciliationHistory,
  type AuditLogQuery,
} from '@/lib/adminAuditClient';

const originalFetch = global.fetch;

function mockFetchOnce(response: {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
}) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: response.json ?? (() => Promise.resolve({})),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('lib/adminAuditClient', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('fetchAuditLog', () => {
    it('builds the query string from an AuditLogQuery', async () => {
      const fetchMock = mockFetchOnce({
        ok: true,
        json: () => Promise.resolve({ entries: [], nextCursor: null }),
      });

      const query: AuditLogQuery = {
        limit: 50,
        before: 123,
        action: 'user.login',
        actor: 'admin@example.com',
        from: '2024-01-01',
        to: '2024-01-31',
      };

      await fetchAuditLog(query);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/api/admin/audit-log?');
      const params = new URLSearchParams(String(url).split('?')[1]);
      expect(params.get('limit')).toBe('50');
      expect(params.get('before')).toBe('123');
      expect(params.get('action')).toBe('user.login');
      expect(params.get('actor')).toBe('admin@example.com');
      expect(params.get('from')).toBe('2024-01-01');
      expect(params.get('to')).toBe('2024-01-31');
    });

    it('omits undefined query fields from the query string', async () => {
      const fetchMock = mockFetchOnce({
        ok: true,
        json: () => Promise.resolve({ entries: [], nextCursor: null }),
      });

      await fetchAuditLog({ limit: 100 });

      const [url] = fetchMock.mock.calls[0];
      const params = new URLSearchParams(String(url).split('?')[1]);
      expect(params.get('limit')).toBe('100');
      expect(params.has('before')).toBe(false);
      expect(params.has('action')).toBe(false);
    });

    it('returns the parsed entries and nextCursor', async () => {
      const payload = {
        entries: [{ id: 1, action: 'user.login' }],
        nextCursor: 42,
      };
      mockFetchOnce({ ok: true, json: () => Promise.resolve(payload) });

      const result = await fetchAuditLog({ limit: 10 });

      expect(result).toEqual(payload);
    });

    it('rejects on a non-2xx response instead of swallowing it', async () => {
      mockFetchOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'boom' }),
      });

      await expect(fetchAuditLog({ limit: 10 })).rejects.toThrow();
    });
  });

  describe('fetchReconciliation', () => {
    it('parses a successful reconciliation response', async () => {
      const payload = {
        checkedAt: '2024-02-01T00:00:00.000Z',
        mismatches: [],
        ok: true,
      };
      mockFetchOnce({ ok: true, json: () => Promise.resolve(payload) });

      const result = await fetchReconciliation();

      expect(result).toEqual(payload);
    });

    it('rejects on a non-2xx response instead of swallowing it', async () => {
      mockFetchOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'unavailable' }),
      });

      await expect(fetchReconciliation()).rejects.toThrow();
    });
  });

  describe('fetchReconciliationHistory', () => {
    it('returns the parsed history list', async () => {
      const payload = [{ id: 1, checkedAt: '2024-02-01T00:00:00.000Z' }];
      mockFetchOnce({ ok: true, json: () => Promise.resolve(payload) });

      const result = await fetchReconciliationHistory();

      expect(result).toEqual(payload);
    });

    it('rejects on a non-2xx response instead of swallowing it', async () => {
      mockFetchOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'boom' }),
      });

      await expect(fetchReconciliationHistory()).rejects.toThrow();
    });
  });
});
