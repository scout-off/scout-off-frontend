/** @type {import('next-sitemap').IConfig} */
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://scoutoff.app';

module.exports = {
  siteUrl,
  generateRobotsTxt: false,
  exclude: [
    '/player',
    '/validator',
    '/scout/subscribe',
    '/admin',
    '/en/admin',
    '/fr/admin',
    '/sw/admin',
    '/*/admin',
    '/api',
    '/api/*',
  ],
  additionalPaths: async (config) => [
    await config.transform(config, '/player/[id]'),
  ],
  sitemapSize: 7000,
};
