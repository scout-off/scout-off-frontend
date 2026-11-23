/**
 * @jest-environment node
 */
import * as fs from 'fs';
import * as path from 'path';

const root = process.cwd();
const cronDir = path.join(root, 'app', 'api', 'cron');

const routePaths = fs
  .readdirSync(cronDir, { withFileTypes: true })
  .filter(
    (e) =>
      e.isDirectory() && fs.existsSync(path.join(cronDir, e.name, 'route.ts')),
  )
  .map((e) => `/api/cron/${e.name}`)
  .sort();

const scheduledPaths = (
  JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')) as {
    crons: { path: string }[];
  }
).crons
  .map((c) => c.path)
  .sort();

describe('vercel.json crons', () => {
  it('schedules every app/api/cron/*/route.ts', () => {
    expect(routePaths.filter((p) => !scheduledPaths.includes(p))).toEqual([]);
  });

  it('only schedules cron paths that have a route file', () => {
    expect(scheduledPaths.filter((p) => !routePaths.includes(p))).toEqual([]);
  });
});
