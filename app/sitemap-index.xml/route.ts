import { NextResponse } from 'next/server';
import { locales } from '@/lib/locales';

// Dynamic, sharded sitemap index (issue #1682).
// Lists the static sitemap plus player shards. Each shard holds at most
// SHARD_SIZE players × locales.length URLs, staying well under the 50k URL
// and 50 MB limits enforced by the sitemap XSD.

export const revalidate = 3600; // 1 hour

export const SHARD_SIZE = 10000;

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://handsoff.example'
).replace(/\/$/, '');

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchPlayerShardCount(): Promise<number> {
  const indexerUrl = process.env.INDEXER_URL;
  if (!indexerUrl) return 0;
  try {
    const res = await fetch(
      `${indexerUrl.replace(/\/$/, '')}/players/sitemap?count=1&size=${SHARD_SIZE}`,
      { next: { revalidate, tags: ['sitemap'] } },
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as { shards?: number };
    return typeof data.shards === 'number' && data.shards > 0 ? data.shards : 0;
  } catch {
    // Degrade gracefully: on indexer outage, still serve the static sitemap.
    return 0;
  }
}

function sitemapEntry(loc: string, lastmod?: string): string {
  const lastmodTag = lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : '';
  return `<sitemap><loc>${escapeXml(loc)}</loc>${lastmodTag}</sitemap>`;
}

export async function GET(): Promise<NextResponse> {
  const now = new Date().toISOString();
  const entries: string[] = [
    sitemapEntry(`${SITE_URL}/sitemaps/static.xml`, now),
  ];

  const shardCount = await fetchPlayerShardCount();
  for (let n = 0; n < shardCount; n += 1) {
    entries.push(sitemapEntry(`${SITE_URL}/sitemaps/players-${n}.xml`, now));
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</sitemapindex>`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, s-maxage=${revalidate}, stale-while-revalidate=86400`,
    },
  });
}
