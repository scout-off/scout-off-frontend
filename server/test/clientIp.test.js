const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const express = require('express');

const tmpDbPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'scout-off-client-ip-')),
  'test.db',
);
process.env.DB_PATH = tmpDbPath;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.TRUST_PROXY_HOPS;

const { getClientIp } = require('../src/clientIp');
const createApp = require('../src/app');
const verifyTurnstile = require('../src/middleware/turnstile');
const db = require('../src/db');

test.after(() => {
  try {
    fs.rmSync(path.dirname(tmpDbPath), { recursive: true, force: true });
  } catch {
    // SQLite can keep the file locked on Windows; the OS cleans temp dirs.
  }
});

/** Plain http request, so global.fetch can be mocked for siteverify. */
function request(port, method, pathname, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: pathname, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const sha256 = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');

// ── helper ───────────────────────────────────────────────────────────────────

test('getClientIp uses req.ip and normalises IPv4-mapped IPv6', () => {
  assert.equal(getClientIp({ ip: '::ffff:203.0.113.7' }), '203.0.113.7');
  assert.equal(getClientIp({ ip: '2001:db8::1' }), '2001:db8::1');
  assert.equal(
    getClientIp({ socket: { remoteAddress: '::ffff:10.0.0.1' } }),
    '10.0.0.1',
  );
  assert.equal(getClientIp({}), 'unknown');
  // A forged header alone never becomes the client IP.
  assert.equal(
    getClientIp({ ip: '127.0.0.1', headers: { 'x-forwarded-for': '6.6.6.6' } }),
    '127.0.0.1',
  );
});

test('getClientIp follows Express trust-proxy resolution', async () => {
  for (const [hops, expected] of [
    [0, '127.0.0.1'],
    [1, '198.51.100.9'],
  ]) {
    const app = express();
    app.set('trust proxy', hops);
    app.get('/ip', (req, res) => res.send(getClientIp(req)));
    const server = await listen(app);
    try {
      const res = await request(server.address().port, 'GET', '/ip', {
        'X-Forwarded-For': '6.6.6.6, 198.51.100.9',
      });
      assert.equal(res.body, expected, `TRUST_PROXY_HOPS=${hops}`);
    } finally {
      server.close();
    }
  }
});

test('no route or middleware reads x-forwarded-for directly', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (
        entry.name.endsWith('.js') &&
        // A real read: req.headers['x-forwarded-for'] or req.get('x-forwarded-for').
        /(headers\s*\[\s*|\.get\(\s*|header\(\s*)['"`]x-forwarded-for['"`]/i.test(
          fs.readFileSync(full, 'utf8'),
        )
      ) {
        offenders.push(path.relative(srcDir, full));
      }
    }
  };
  walk(srcDir);
  assert.deepEqual(offenders, []);
});

// ── waitlist ip_hash ─────────────────────────────────────────────────────────

test('a forged X-Forwarded-For does not change the stored waitlist ip_hash (0 hops)', async () => {
  const server = await listen(createApp());
  try {
    const body = JSON.stringify({
      email: 'spoof@example.com',
      interestType: 'fan',
    });
    const res = await request(
      server.address().port,
      'POST',
      '/sponsorship/waitlist',
      {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Forwarded-For': '6.6.6.6',
      },
      body,
    );
    assert.ok(
      res.status < 300,
      `waitlist signup failed: ${res.status} ${res.body}`,
    );
    const row = db
      .prepare('SELECT ip_hash FROM sponsorship_waitlist WHERE email = ?')
      .get('spoof@example.com');
    assert.equal(row.ip_hash, sha256('127.0.0.1'));
    assert.notEqual(row.ip_hash, sha256('6.6.6.6'));
  } finally {
    server.close();
  }
});

// ── Turnstile remoteip ───────────────────────────────────────────────────────

test('Turnstile sends req.ip as remoteip, never the forged header', async () => {
  const originalFetch = global.fetch;
  const sent = [];
  global.fetch = async (_url, init) => {
    sent.push(new URLSearchParams(init.body.toString()));
    return { json: async () => ({ success: true }) };
  };
  process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  try {
    const req = {
      ip: '::ffff:127.0.0.1',
      headers: { 'x-forwarded-for': '6.6.6.6' },
      body: { turnstileToken: 'token' },
    };
    let nextCalled = false;
    await verifyTurnstile(req, { status: () => ({ json: () => {} }) }, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].get('remoteip'), '127.0.0.1');
  } finally {
    global.fetch = originalFetch;
    delete process.env.TURNSTILE_SECRET_KEY;
  }
});
