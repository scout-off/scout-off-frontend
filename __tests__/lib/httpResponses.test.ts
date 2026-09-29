/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/httpResponses';
import { GET as auditLogGET } from '@/app/api/admin/audit-log/route';
import { GET as moderationLogGET } from '@/app/api/admin/automated-moderation-log/route';
import { AdminAuditStore } from '@/lib/adminAuditStore';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const API_DIR = path.join(process.cwd(), 'app/api');

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === 'route.ts' ? [full] : [];
  });
}

/** Routes that return per-user or admin data and must never be cached. */
function authenticatedRouteFiles(): string[] {
  return routeFiles(API_DIR).filter((file) => {
    const rel = path.relative(API_DIR, file);
    const src = fs.readFileSync(file, 'utf8');
    return (
      rel.startsWith(`admin${path.sep}`) ||
      /\b(getSessionWallet|requireAdminWallet)\b/.test(src)
    );
  });
}

describe('privateJson', () => {
  it('sets private no-store caching and varies on Cookie', async () => {
    const res = privateJson({ ok: true }, { status: 201 });

    expect(res.status).toBe(201);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('Vary')).toContain('Cookie');
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('authenticated API routes', () => {
  const files = authenticatedRouteFiles();

  it('finds the authenticated route modules', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [path.relative(process.cwd(), f), f]))(
    '%s never builds a JSON response without private caching headers',
    (_rel, file) => {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).not.toMatch(/\bNextResponse\.json\(/);
      expect(src).not.toMatch(/(?<!Next)\bResponse\.json\(/);
      if (/new (Next)?Response\(JSON\.stringify/.test(src)) {
        expect(src).toContain("'private, no-store'");
      }
    },
  );

  it('keeps the public media route cacheable', () => {
    const src = fs.readFileSync(
      path.join(API_DIR, 'media/[cid]/route.ts'),
      'utf8',
    );
    expect(src).not.toContain('privateJson');
    expect(src).toMatch(/Cache-Control/);
  });
});

describe('authenticated responses at runtime', () => {
  const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';

  beforeEach(() => {
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
    AdminAuditStore.resetInstance();
    AdminAuditStore.getInstance(':memory:');
  });

  afterAll(() => {
    AdminAuditStore.resetInstance();
  });

  it('GET /api/admin/audit-log with an admin session is private, no-store', async () => {
    SessionStore.getInstance().create(
      'sid-cache-test',
      ADMIN,
      Date.now() + 60 * 60 * 1000,
    );
    const token = createSessionToken(ADMIN, 'access', 20 * 60, {
      sid: 'sid-cache-test',
    });
    const res = await auditLogGET(
      new NextRequest('http://localhost/api/admin/audit-log', {
        headers: { cookie: `session=${token}` },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('Vary')).toContain('Cookie');
  });

  it('GET /api/admin/automated-moderation-log is private, no-store', async () => {
    const res = await moderationLogGET(
      new NextRequest('http://localhost/api/admin/automated-moderation-log'),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
