'use strict';

/**
 * Mock backend API server for local development.
 *
 * Implements just enough of the REST surface lib/api.ts calls (see
 * NEXT_PUBLIC_API_URL) to let a contributor browse the app without a real
 * backend deployment. Responses are static/generated fixtures — nothing is
 * persisted across restarts and there's no auth, so this must never be
 * pointed at from anything but docker-compose.yml's local dev stack.
 */

const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

function mockPlayer(id) {
  return {
    id,
    vitals: {
      name: 'Mock Player',
      age: 19,
      position: 'Forward',
      region: 'West Africa',
      nationality: 'Nigeria',
    },
    ipfsHash: 'QmMockPlayerHighlightReel1111111111111111111',
    progressLevel: 1,
    milestones: [],
    createdAt: 1700000000,
    archived: false,
  };
}

function mockScout(id) {
  return {
    id,
    name: 'Mock Scout',
    organization: 'Mock FC Scouting Network',
    subscriptionTier: 'basic',
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const ROUTES = [
  {
    method: 'GET',
    pattern: /^\/players\/search$/,
    handler: (req, res, { searchParams }) => {
      const name = searchParams.get('name') || '';
      sendJson(res, 200, [
        mockPlayer(`player_mock_${encodeURIComponent(name) || '1'}`),
      ]);
    },
  },
  {
    method: 'GET',
    pattern: /^\/players\/([^/]+)\/comments$/,
    handler: (req, res, { match }) => sendJson(res, 200, []),
  },
  {
    method: 'POST',
    pattern: /^\/players\/([^/]+)\/archive$/,
    handler: (req, res, { match }) =>
      sendJson(res, 200, { ...mockPlayer(match[1]), archived: true }),
  },
  {
    method: 'POST',
    pattern: /^\/players\/([^/]+)\/unarchive$/,
    handler: (req, res, { match }) =>
      sendJson(res, 200, { ...mockPlayer(match[1]), archived: false }),
  },
  {
    method: 'GET',
    pattern: /^\/players\/([^/]+)$/,
    handler: (req, res, { match }) => sendJson(res, 200, mockPlayer(match[1])),
  },
  {
    method: 'GET',
    pattern: /^\/scouts\/([^/]+)\/contacts$/,
    handler: (req, res, { match }) => sendJson(res, 200, []),
  },
  {
    method: 'GET',
    pattern: /^\/scouts\/([^/]+)\/stats$/,
    handler: (req, res, { match }) =>
      sendJson(res, 200, { contactedCount: 0, trialOffersCount: 0 }),
  },
  {
    method: 'GET',
    pattern: /^\/scouts\/([^/]+)$/,
    handler: (req, res, { match }) => sendJson(res, 200, mockScout(match[1])),
  },
  {
    method: 'GET',
    pattern: /^\/chat\/([^/]+)$/,
    handler: (req, res, { match }) => sendJson(res, 200, []),
  },
  {
    method: 'POST',
    pattern: /^\/chat\/([^/]+)$/,
    handler: async (req, res, { match }) => {
      const body = await readBody(req);
      sendJson(res, 200, {
        roomId: match[1],
        message: body.message ?? '',
        sender: body.sender ?? 'unknown',
        timestamp: Date.now(),
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/admin\/activity$/,
    handler: (req, res) => sendJson(res, 200, { events: [], total: 0 }),
  },
  {
    method: 'GET',
    pattern: /^\/validators\/([^/]+)\/stats$/,
    handler: (req, res, { match }) => sendJson(res, 200, { milestoneCount: 0 }),
  },
];

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  for (const route of ROUTES) {
    if (route.method !== req.method) continue;
    const match = url.pathname.match(route.pattern);
    if (match) {
      try {
        await route.handler(req, res, {
          match,
          searchParams: url.searchParams,
        });
      } catch (err) {
        console.error(
          `[mock-api] handler failed for ${req.method} ${url.pathname}`,
          err,
        );
        sendJson(res, 500, { error: 'Internal mock-api error' });
      }
      return;
    }
  }

  sendJson(res, 404, {
    error: `No mock route for ${req.method} ${url.pathname}`,
  });
});

server.listen(PORT, () => {
  console.log(`[mock-api] listening on port ${PORT}`);
});
