/** @jest-environment node */
import * as fs from 'fs';
import * as path from 'path';
import { ENV_MANIFEST } from '@/lib/envManifest';

const ROOT = path.join(__dirname, '..', '..');

describe('lib/envManifest.json CRON_SECRET', () => {
  it('lists every scheduled cron route in usedBy', () => {
    const crons = (
      JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as {
        crons: { path: string }[];
      }
    ).crons.map((c) => `app${c.path}/route.ts`);
    const cronSecret = ENV_MANIFEST.find((v) => v.name === 'CRON_SECRET');

    expect([...(cronSecret?.usedBy ?? [])].sort()).toEqual(crons.sort());
  });
});
