/**
 * @jest-environment node
 */
import { logger, createScopedLogger } from '../logger';

describe('logger (shared schema — issue #1519)', () => {
  let originalWrite: typeof process.stdout.write;
  let capturedOutput: string[];

  beforeEach(() => {
    capturedOutput = [];
    originalWrite = process.stdout.write;
    process.stdout.write = (chunk: string | Buffer) => {
      capturedOutput.push(chunk.toString());
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    delete process.env.LOG_LEVEL;
  });

  // ── Shared-schema field names ────────────────────────────────────────────

  describe('shared JSON schema — aligned to lib/logger.ts and server/src/logger.js', () => {
    test('emits `timestamp` (not `ts`) as an ISO-8601 string', () => {
      logger.info('test message');

      expect(capturedOutput).toHaveLength(1);
      const log = JSON.parse(capturedOutput[0]);
      expect(log).toHaveProperty('timestamp');
      expect(log.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      // Old field name must not appear
      expect(log).not.toHaveProperty('ts');
    });

    test('emits `message` (not `msg`) for the human-readable description', () => {
      logger.info('test message');

      const log = JSON.parse(capturedOutput[0]);
      expect(log).toHaveProperty('message', 'test message');
      // Old field name must not appear
      expect(log).not.toHaveProperty('msg');
    });

    test('emits `level` matching the call site', () => {
      logger.warn('something cautious');

      const log = JSON.parse(capturedOutput[0]);
      expect(log).toHaveProperty('level', 'warn');
    });

    test('includes optional caller-supplied fields in output', () => {
      logger.info('processing ledger', { ledger: 100, eventCount: 5 });

      const log = JSON.parse(capturedOutput[0]);
      expect(log.ledger).toBe(100);
      expect(log.eventCount).toBe(5);
    });

    test('output is valid JSON', () => {
      logger.info('any message');
      expect(() => JSON.parse(capturedOutput[0])).not.toThrow();
    });

    test('all four levels emit the shared field set', () => {
      // error, warn, info are above the default (info) threshold
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(capturedOutput).toHaveLength(3);
      capturedOutput.forEach((output) => {
        const log = JSON.parse(output);
        expect(log).toHaveProperty('level');
        expect(log).toHaveProperty('message');
        expect(log).toHaveProperty('timestamp');
        expect(log).not.toHaveProperty('ts');
        expect(log).not.toHaveProperty('msg');
      });
    });
  });

  // ── Level filtering (default = info) ────────────────────────────────────

  describe('level filtering', () => {
    test('default level filters out debug, passes info/warn/error', () => {
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // debug should be filtered at default INFO level
      expect(capturedOutput).toHaveLength(3);
      const levels = capturedOutput.map((o) => JSON.parse(o).level);
      expect(levels).not.toContain('debug');
      expect(levels).toContain('info');
      expect(levels).toContain('warn');
      expect(levels).toContain('error');
    });
  });

  // ── createScopedLogger ───────────────────────────────────────────────────

  describe('createScopedLogger — requestId / route correlation', () => {
    test('stamps requestId and route onto every line', () => {
      const log = createScopedLogger({
        requestId: 'run-abc-123',
        route: 'indexer/ledger-sync',
      });
      log.info('sync started', { ledger: 42 });

      const entry = JSON.parse(capturedOutput[0]);
      expect(entry.requestId).toBe('run-abc-123');
      expect(entry.route).toBe('indexer/ledger-sync');
      expect(entry.message).toBe('sync started');
      expect(entry.ledger).toBe(42);
    });

    test('omits requestId / route when not provided', () => {
      const log = createScopedLogger({});
      log.info('no scope fields');

      const entry = JSON.parse(capturedOutput[0]);
      expect(entry).not.toHaveProperty('requestId');
      expect(entry).not.toHaveProperty('route');
    });

    test('scoped logger still uses shared schema field names', () => {
      const log = createScopedLogger({ requestId: 'x' });
      log.error('something failed');

      const entry = JSON.parse(capturedOutput[0]);
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('message');
      expect(entry).not.toHaveProperty('ts');
      expect(entry).not.toHaveProperty('msg');
    });

    test('scoped logger respects level filtering', () => {
      const log = createScopedLogger({ requestId: 'y' });
      log.debug('should be filtered');

      // debug filtered at default INFO level
      expect(capturedOutput).toHaveLength(0);
    });
  });
});
