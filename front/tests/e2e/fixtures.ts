import { test as base, expect, request, type APIRequestContext } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const legacyId = 'e2e-legacy';
const origin = new URL(process.env.TEST_BASE_URL || 'http://localhost:3000').origin;
const back = fileURLToPath(new URL('../../../back/', import.meta.url));
const bootstrap = `
import { NestFactory } from '@nestjs/core';
const { AppModule } = await import('./dist/src/app.module.js');
const { DatabaseService } = await import('./dist/src/infra/database/database.service.js');
const app = await NestFactory.create(AppModule, { logger: false });
await app.listen(0, '127.0.0.1');
const legacy = {
 schemaVersion:1,units:'meters',coordinateSystem:'right-handed-y-up-xz-floor',
 environment:{perimeter:[{id:'a',x:0,z:0},{id:'b',x:10,z:0},{id:'c',x:10,z:8},{id:'d',x:0,z:8}],wallHeightMeters:2.8,confirmedAt:'2026-11-04T12:00:00Z',measurement:{source:'manual',recordedAt:'2026-11-04T12:00:00Z',checks:[]}},
 restrictedAreas:[],posts:[],belts:[],routes:[],people:[
  {id:'legacy-a',routeId:null,distanceAlongRouteMeters:null,position:{x:5,z:6},yawRadians:0},
  {id:'legacy-b',routeId:null,distanceAlongRouteMeters:null,position:{x:5,z:4.4},yawRadians:0}
 ],simulation:{spacingMeters:0.8,personHeightMeters:1.7,personRadiusMeters:0.22,clearanceMeters:0.05}
};
app.get(DatabaseService).prepare('INSERT INTO projects (id,owner_id,name,created_at,updated_at,revision,schema_version,scene) VALUES (?,?,?,?,?,?,?,?)').run('${legacyId}','local-project-owner','E2E legacy','2026-11-04T12:00:00Z','2026-11-04T12:00:00Z',1,1,JSON.stringify(legacy));
console.log('E2E_READY ' + await app.getUrl());
`;

export const test = base.extend<{ api: APIRequestContext }, { privateApi: string }>({
  privateApi: [async ({}, use) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'testafila-e2e-'));
    const child = spawn(process.execPath, ['--input-type=module', '-e', bootstrap], {
      cwd: back, env: { ...process.env, DATABASE_PATH: path.join(directory, 'e2e.sqlite'), APP_ORIGIN: origin },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let stdout = ''; let stderr = '';
        const timer = setTimeout(() => reject(new Error('Temporary API did not start: ' + stderr)), 20_000);
        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
          const match = stdout.match(/E2E_READY (http:\/\/127\.0\.0\.1:\d+)/);
          if (match) { clearTimeout(timer); resolve(match[1]); }
        });
        child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-2000); });
        child.once('error', (error) => { clearTimeout(timer); reject(error); });
        child.once('exit', (code) => { clearTimeout(timer); reject(new Error('Temporary API exited: ' + code + ' ' + stderr)); });
      });
      await use(url);
    } finally {
      if (child.exitCode === null) {
        const stopped = new Promise<void>((resolve) => child.once('exit', () => resolve()));
        child.kill(); await stopped;
      }
      if (path.dirname(directory) !== tmpdir() || !path.basename(directory).startsWith('testafila-e2e-')) throw new Error('Unexpected cleanup directory');
      await rm(directory, { recursive: true, force: true });
    }
  }, { scope: 'worker' }],
  api: async ({ privateApi }, use) => {
    const api = await request.newContext({ baseURL: privateApi, extraHTTPHeaders: { origin } });
    try { await use(api); } finally { await api.dispose(); }
  },
  page: async ({ page, privateApi }, use) => {
    // Redirect every browser API request to a disposable database. Never write
    // through the Next server's real proxy during these browser tests.
    await page.route('**/api/**', async (route) => {
      const source = new URL(route.request().url());
      const response = await route.fetch({ url: privateApi + source.pathname + source.search, headers: { ...route.request().headers(), origin } });
      await route.fulfill({ response });
    });
    await use(page);
  },
});
export { expect };
