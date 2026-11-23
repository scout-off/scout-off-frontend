const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const {
  createShutdown,
  shutdownTimeoutMs,
  registerShutdownSignals,
} = require('../src/lifecycle');

function silentLogger() {
  const lines = [];
  const log = (level) => (message, fields) =>
    lines.push({ level, message, ...fields });
  return { lines, info: log('info'), warn: log('warn'), error: log('error') };
}

/** A server whose /slow route answers after `delayMs`. */
function startServer(delayMs) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/slow') {
        setTimeout(() => res.end('done'), delayMs);
        return;
      }
      res.end('ok');
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function get(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: pathname, agent: false },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body, headers: res.headers }),
        );
      },
    );
    req.on('error', reject);
  });
}

test('SHUTDOWN_TIMEOUT_MS defaults to 10s and can be overridden', () => {
  assert.equal(shutdownTimeoutMs({}), 10_000);
  assert.equal(shutdownTimeoutMs({ SHUTDOWN_TIMEOUT_MS: '2500' }), 2500);
  assert.equal(shutdownTimeoutMs({ SHUTDOWN_TIMEOUT_MS: 'nope' }), 10_000);
});

test('clean shutdown: in-flight request finishes, new connections refused, resources closed, exit 0', async () => {
  const server = await startServer(150);
  const port = server.address().port;
  const closed = [];
  const exits = [];
  const { shutdown } = createShutdown({
    server,
    resources: [
      { name: 'redis', close: async () => closed.push('redis') },
      { name: 'sqlite', close: () => closed.push('sqlite') },
    ],
    logger: silentLogger(),
    timeoutMs: 5_000,
    exit: (code) => exits.push(code),
  });

  const inFlight = get(port, '/slow');
  await new Promise((r) => setTimeout(r, 30));
  const done = shutdown('SIGTERM');

  // New connections are refused once shutdown begins.
  await assert.rejects(
    get(port, '/'),
    /ECONNREFUSED|ECONNRESET|socket hang up/,
  );

  const res = await inFlight;
  assert.equal(res.status, 200);
  assert.equal(res.body, 'done');

  await done;
  assert.deepEqual(closed, ['redis', 'sqlite']);
  assert.deepEqual(exits, [0]);
});

test('timeout path: remaining sockets are destroyed and the exit code is 1', async () => {
  const server = await startServer(5_000);
  const port = server.address().port;
  const closed = [];
  const exits = [];
  const logger = silentLogger();
  const { shutdown } = createShutdown({
    server,
    resources: [{ name: 'sqlite', close: () => closed.push('sqlite') }],
    logger,
    timeoutMs: 100,
    exit: (code) => exits.push(code),
  });

  const inFlight = get(port, '/slow').catch((err) => err);
  await new Promise((r) => setTimeout(r, 30));
  const started = Date.now();
  await shutdown('SIGTERM');

  assert.ok(
    Date.now() - started < 2_000,
    'shutdown must be bounded by the timeout',
  );
  assert.ok((await inFlight) instanceof Error, 'the stuck request was cut off');
  assert.deepEqual(
    closed,
    ['sqlite'],
    'resources are still closed after a timeout',
  );
  assert.deepEqual(exits, [1]);
  assert.ok(logger.lines.some((l) => l.message.includes('deadline')));
});

test('a second signal during shutdown forces exit 1', async () => {
  const server = await startServer(5_000);
  const exits = [];
  const { shutdown } = createShutdown({
    server,
    resources: [],
    logger: silentLogger(),
    timeoutMs: 200,
    exit: (code) => exits.push(code),
  });
  const first = shutdown('SIGTERM');
  shutdown('SIGINT');
  assert.deepEqual(exits, [1]);
  await first;
});

test('a resource that fails to close makes the exit code 1', async () => {
  const server = await startServer(0);
  const exits = [];
  const { shutdown } = createShutdown({
    server,
    resources: [
      {
        name: 'redis',
        close: async () => {
          throw new Error('boom');
        },
      },
    ],
    logger: silentLogger(),
    timeoutMs: 1_000,
    exit: (code) => exits.push(code),
  });
  await shutdown('SIGTERM');
  assert.deepEqual(exits, [1]);
});

test('SIGTERM and SIGINT are registered', () => {
  const handlers = {};
  const fakeProcess = { on: (signal, fn) => (handlers[signal] = fn) };
  const calls = [];
  registerShutdownSignals((signal) => calls.push(signal), fakeProcess);
  handlers.SIGTERM();
  handlers.SIGINT();
  assert.deepEqual(calls, ['SIGTERM', 'SIGINT']);
});

test('the real db closes cleanly', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-off-lifecycle-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  const db = require('../src/db');
  assert.equal(db.open, true);
  db.close();
  assert.equal(db.open, false);
});
