/**
 * Player profile sitemap entries (issue #1350, #1682).
 *
 * Player ids come from the indexer's `GET /players/sitemap` endpoint, which
 * already excludes archived players and returns `{id, lastmod}` per shard.
 * Players listed in SITEMAP_PLAYER_DENYLIST (comma-separated ids) are left
 * out here. Locales come from `lib/locales.ts` so hreflang alternates stay in
 * sync with the app.
 */
const { LOCALES } = require('./locales');

const SHARD_SIZE = 10000;

function getDenylist() {
  return (process.env.SITEMAP_PLAYER_DENYLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchShard(indexerUrl, shard, size, fetchImpl) {
  const params = new URLSearchParams({
    shard: String(shard),
    size: String(size),
  });
  const res = await fetchImpl(`${indexerUrl}/players/sitemap?${params}`);
  if (!res.ok) throw new Error(`Indexer returned ${res.status}`);
  const body = await res.json();
  return body.players ?? [];
}

async function getPlayerSitemapPaths({
  siteUrl,
  indexerUrl = process.env.NEXT_PUBLIC_INDEXER_API_URL ??
    'http://localhost:3001',
  denylist = getDenylist(),
  shard = 0,
  size = SHARD_SIZE,
  fetchImpl = fetch,
} = {}) {
  let players;
  try {
    players = await fetchShard(indexerUrl, shard, size, fetchImpl);
  } catch (err) {
    // Don't fail the whole build if the indexer is unreachable.
    console.warn(`[sitemap] skipping player URLs: ${err.message}`);
    return [];
  }

  const denied = new Set(denylist);
  const paths = [];
  for (const player of players) {
    const id = player.id;
    if (!id || denied.has(id)) continue;
    const suffix = `/player/${encodeURIComponent(id)}`;
    const alternateRefs = LOCALES.map((locale) => ({
      href: `${siteUrl}/${locale}${suffix}`,
      hreflang: locale,
      hrefIsAbsolute: true,
    }));
    const lastmod = player.lastmod
      ? new Date(player.lastmod * 1000).toISOString()
      : undefined;
    for (const locale of LOCALES) {
      paths.push({
        loc: `/${locale}${suffix}`,
        lastmod,
        changefreq: 'weekly',
        priority: 0.7,
        alternateRefs,
      });
    }
  }
  return paths;
}

module.exports = { getPlayerSitemapPaths, LOCALES, SHARD_SIZE };
