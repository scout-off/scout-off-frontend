/** @jest-environment node */
/**
 * Contract tests (#1708): call the route handlers behind the generated client
 * and validate each response body against the schema that
 * openapi/scout-off-api.yaml declares for that path, method and status. Type
 * generation alone cannot catch spec ↔ handler drift; these tests do.
 */
import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import { parse } from 'yaml';
import { NextRequest } from 'next/server';
import * as watchlist from '@/app/api/watchlist/route';
import * as savedSearches from '@/app/api/saved-searches/route';
import * as recentlyViewed from '@/app/api/recently-viewed/route';
import { WatchlistStore } from '@/lib/watchlistStore';
import { SavedSearchStore } from '@/lib/savedSearchStore';
import { RecentlyViewedStore } from '@/lib/recentlyViewedStore';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

type Method = 'get' | 'post' | 'patch' | 'delete';

interface SpecResponse {
  $ref?: string;
  content?: { 'application/json'?: { schema?: unknown } };
}

const spec = parse(
  fs.readFileSync(
    path.join(__dirname, '../../openapi/scout-off-api.yaml'),
    'utf8',
  ),
) as {
  paths: Record<
    string,
    Partial<Record<Method, { responses: Record<string, SpecResponse> }>>
  >;
  components: { responses: Record<string, SpecResponse> };
};

// OpenAPI 3.0 schemas are JSON Schema plus a few extra keywords, so strict
// mode is off; `format` is informational here (no ajv-formats).
const ajv = new Ajv({ strict: false, validateFormats: false });
ajv.addSchema({ $id: 'spec', components: spec.components });

/** The response schema the spec declares for `METHOD path` → `status`. */
function responseSchema(specPath: string, method: Method, status: number) {
  let res = spec.paths[specPath]?.[method]?.responses[String(status)];
  if (!res) {
    throw new Error(
      `spec has no ${status} for ${method.toUpperCase()} ${specPath}`,
    );
  }
  if (res.$ref) {
    res = spec.components.responses[res.$ref.split('/').pop()!];
  }
  return res.content?.['application/json']?.schema;
}

/** Rewrites local `#/components/...` refs to the registered `spec` schema. */
function resolveRefs(schema: unknown): unknown {
  return JSON.parse(
    JSON.stringify(schema).replace(/"#\/components\//g, '"spec#/components/'),
  );
}

async function expectMatchesSpec(
  res: Response,
  specPath: string,
  method: Method,
  expectedStatus: number,
) {
  expect(res.status).toBe(expectedStatus);
  const schema = responseSchema(specPath, method, res.status);
  expect(schema).toBeDefined();
  const validate = ajv.compile(resolveRefs(schema) as object);
  const body: unknown = await res.json();
  if (!validate(body)) {
    throw new Error(
      `${method.toUpperCase()} ${specPath} ${res.status} does not match the spec: ` +
        ajv.errorsText(validate.errors),
    );
  }
}

const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';
// The watchlist route only accepts checksum-valid Stellar public keys.
const PLAYER = 'GDGXH65ASAZNBPSWMQWO6R4HHT3KQ7VY3DPAQBE2DQGJVSBZL4VAC4AK';

let sidCounter = 0;

function request(
  route: string,
  init: { method?: string; body?: unknown; auth?: boolean } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.auth !== false) {
    const sid = `contract-sid-${sidCounter++}`;
    SessionStore.getInstance().create(sid, SCOUT, Date.now() + 60 * 60 * 1000);
    headers['cookie'] =
      `session=${createSessionToken(SCOUT, 'access', 20 * 60, { sid })}`;
  }
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost/api${route}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

function resetStores() {
  WatchlistStore.resetInstance();
  SavedSearchStore.resetInstance();
  RecentlyViewedStore.resetInstance();
  SessionStore.resetInstance();
}

beforeEach(resetStores);
afterEach(resetStores);

describe('OpenAPI contract: /watchlist', () => {
  it('GET 200, POST 201 and DELETE 200 match the spec', async () => {
    const created = await watchlist.POST(
      request('/watchlist', { method: 'POST', body: { playerId: PLAYER } }),
    );
    const entry = (await created.clone().json()) as { id: number };
    await expectMatchesSpec(created, '/watchlist', 'post', 201);

    await expectMatchesSpec(
      await watchlist.GET(request('/watchlist')),
      '/watchlist',
      'get',
      200,
    );

    await expectMatchesSpec(
      await watchlist.DELETE(
        request('/watchlist', { method: 'DELETE', body: { id: entry.id } }),
      ),
      '/watchlist',
      'delete',
      200,
    );
  });

  it('GET 401 matches the spec', async () => {
    await expectMatchesSpec(
      await watchlist.GET(request('/watchlist', { auth: false })),
      '/watchlist',
      'get',
      401,
    );
  });
});

describe('OpenAPI contract: /saved-searches', () => {
  it('GET 200, POST 201, PATCH 200 and DELETE 200 match the spec', async () => {
    const created = await savedSearches.POST(
      request('/saved-searches', {
        method: 'POST',
        body: { name: 'Strikers', filter: { position: 'Striker' } },
      }),
    );
    const search = (await created.clone().json()) as { id: number };
    await expectMatchesSpec(created, '/saved-searches', 'post', 201);

    await expectMatchesSpec(
      await savedSearches.GET(request('/saved-searches')),
      '/saved-searches',
      'get',
      200,
    );

    await expectMatchesSpec(
      await savedSearches.PATCH(
        request('/saved-searches', {
          method: 'PATCH',
          body: { id: search.id, name: 'Forwards' },
        }),
      ),
      '/saved-searches',
      'patch',
      200,
    );

    await expectMatchesSpec(
      await savedSearches.DELETE(
        request('/saved-searches', {
          method: 'DELETE',
          body: { id: search.id },
        }),
      ),
      '/saved-searches',
      'delete',
      200,
    );
  });
});

describe('OpenAPI contract: /recently-viewed', () => {
  it('GET 200, POST 201 and DELETE 200 match the spec', async () => {
    const created = await recentlyViewed.POST(
      request('/recently-viewed', {
        method: 'POST',
        body: { playerId: PLAYER, viewedAt: 1_700_000_000_000 },
      }),
    );
    const entry = (await created.clone().json()) as { id: number };
    await expectMatchesSpec(created, '/recently-viewed', 'post', 201);

    await expectMatchesSpec(
      await recentlyViewed.GET(request('/recently-viewed')),
      '/recently-viewed',
      'get',
      200,
    );

    await expectMatchesSpec(
      await recentlyViewed.DELETE(
        request('/recently-viewed', {
          method: 'DELETE',
          body: { id: entry.id },
        }),
      ),
      '/recently-viewed',
      'delete',
      200,
    );
  });
});
