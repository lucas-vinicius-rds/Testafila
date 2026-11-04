import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Shared project flows and exact trusted origins run through the Nest application', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'testafila-api-'));
  const previous = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    APP_ORIGIN: process.env.APP_ORIGIN,
  };
  process.env.DATABASE_PATH = path.join(tempDir, 'integration.sqlite');
  const localOrigin = 'http://localhost:3000';
  const publicOrigin = 'https://defendant-dragging-dreadlock.ngrok-free.dev';
  process.env.APP_ORIGIN = ` ${localOrigin}, ${publicOrigin},${localOrigin} `;

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/src/app.module.js');
  const { getAppOrigins } = await import('../dist/src/common/app-origins.js');

  async function startApp() {
    const app = await NestFactory.create(AppModule, { logger: false });
    app.enableCors({ origin: getAppOrigins(), credentials: true });
    await app.listen(0, '127.0.0.1');
    return { app, base: await app.getUrl() };
  }

  let app;
  try {
    ({ app } = await startApp());
    const base = await app.getUrl();
    for (const origin of [localOrigin, publicOrigin]) {
      const preflight = await fetch(base + '/api/projects', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    }
    const foreignPreflight = await fetch(base + '/api/projects', { method: 'OPTIONS', headers: { origin: 'https://attacker.invalid', 'access-control-request-method': 'POST' } });
    assert.equal(foreignPreflight.headers.get('access-control-allow-origin'), null);
    const health = await fetch(base + '/api/health');
    assert.deepEqual(await health.json(), { status: 'ok' });
    const scene = {
      schemaVersion: 1, units: 'meters', coordinateSystem: 'right-handed-y-up-xz-floor',
      environment: { perimeter: [{ id: 'v1', x: 0, z: 0 }, { id: 'v2', x: 5, z: 0 }, { id: 'v3', x: 5, z: 5 }, { id: 'v4', x: 0, z: 5 }], wallHeightMeters: 3, measurement: { source: 'manual', recordedAt: new Date().toISOString(), checks: [] }, confirmedAt: null },
      restrictedAreas: [], posts: [], belts: [], routes: [], people: [],
      simulation: { spacingMeters: 0.8, personHeightMeters: 1.7, personRadiusMeters: 0.25, clearanceMeters: 0.1 },
    };
    const input = { name: 'Integration project', scene, expectedRevision: null };
    const rejected = await fetch(`${base}/api/projects`, { method: 'POST', headers: { origin: 'https://attacker.invalid', 'content-type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(rejected.status, 403, 'mutations reject untrusted origins');

    const createdResponse = await fetch(`${base}/api/projects`, { method: 'POST', headers: { origin: localOrigin, 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const createdText = await createdResponse.text();
    assert.equal(createdResponse.status, 201, createdText);
    const created = JSON.parse(createdText);
    assert.equal(created.scene.environment.confirmedAt, null);
    assert.equal(created.scene.environment.measurement.observedErrorPercent, undefined, 'empty checks never imply zero error');

    const invalidScenes = [
      { ...scene, environment: null },
      { ...scene, environment: { ...scene.environment, perimeter: [{ id: 'v1', x: 0, z: 0 }, null, ...scene.environment.perimeter.slice(2)] } },
      { ...scene, environment: { ...scene.environment, perimeter: [{ id: 'v1', x: 0, z: 0 }, { id: 'v2', x: 5, z: 5 }, { id: 'v3', x: 0, z: 5 }, { id: 'v4', x: 5, z: 0 }] } },
      { ...scene, environment: { ...scene.environment, confirmedAt: 'not-a-date' } },
      { ...scene, simulation: null },
    ];
    for (const invalidScene of invalidScenes) {
      const response = await fetch(`${base}/api/projects`, { method: 'POST', headers: { origin: localOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ ...input, scene: invalidScene }) });
      assert.equal(response.status, 400, 'malformed and geometrically invalid scenes return 400');
    }

    const measuredScene = structuredClone(scene);
    measuredScene.environment.measurement.checks = [{ fromVertexId: 'v1', toVertexId: 'v2', measuredMeters: 4 }];
    const measuredSave = await fetch(`${base}/api/projects`, { method: 'POST', headers: { origin: localOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ ...input, name: 'Measured floor plan', scene: measuredScene }) });
    assert.equal(measuredSave.status, 201);
    const measured = await measuredSave.json();
    assert.equal(measured.scene.environment.measurement.observedErrorPercent, 25, 'error is derived from independent measurement checks');

    const tooLarge = await fetch(`${base}/api/projects`, { method: 'POST', headers: { origin: localOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ ...input, extra: 'x'.repeat(110_000) }) });
    assert.equal(tooLarge.status, 413, 'oversized JSON body is rejected before project validation');
    assert.equal((await tooLarge.json()).error.code, 'PAYLOAD_TOO_LARGE');
    const malformedJson = await fetch(`${base}/api/projects`, { method: 'POST', headers: { origin: localOrigin, 'content-type': 'application/json' }, body: '{"scene":' });
    assert.equal(malformedJson.status, 400, 'malformed JSON keeps its client error status under the production filter');
    assert.equal((await malformedJson.json()).error.code, 'BAD_REQUEST');

    const shared = await fetch(`${base}/api/projects/${created.id}`);
    assert.equal(shared.status, 200, 'projects are readable without login or cookies');
    assert.deepEqual((await shared.json()).scene, created.scene);
    const allowedUpdate = await fetch(`${base}/api/projects/${created.id}`, {
      method: 'PATCH', headers: { origin: publicOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, name: 'Updated from public origin', expectedRevision: 1 }),
    });
    assert.equal(allowedUpdate.status, 200, await allowedUpdate.clone().text());
    assert.equal((await allowedUpdate.json()).revision, 2);
    for (const origin of [undefined, 'null', 'https://attacker.invalid', publicOrigin + '.attacker.invalid', localOrigin + ',' + publicOrigin]) {
      const headers = { 'content-type': 'application/json', ...(origin === undefined ? {} : { origin }) };
      for (const [method, suffix, body] of [
        ['POST', '', { ...input, name: 'Rejected origin' }],
        ['PATCH', '/' + created.id, { ...input, expectedRevision: 2 }],
        ['DELETE', '/' + created.id, undefined],
      ]) {
        const rejected = await fetch(base + '/api/projects' + suffix, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
        assert.equal(rejected.status, 403, method + ' rejects missing/untrusted origin');
      }
    }
    const preserved = await fetch(`${base}/api/projects/${created.id}`);
    assert.equal((await preserved.json()).revision, 2, 'rejected mutations preserve the saved revision');

    const conflict = await fetch(`${base}/api/projects/${created.id}`, { method: 'PATCH', headers: { origin: localOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ ...input, expectedRevision: 7 }) });
    assert.equal(conflict.status, 409);

    await app.close();
    ({ app } = await startApp());
    const persisted = await fetch(`${await app.getUrl()}/api/projects`, {});
    assert.equal(persisted.status, 200);
    assert.ok((await persisted.json()).projects.some((project) => project.id === created.id), 'project survives a Nest restart');
    const reopenedResponse = await fetch(`${await app.getUrl()}/api/projects/${created.id}`, {});
    assert.equal(reopenedResponse.status, 200);
    const reopened = await reopenedResponse.json();
    assert.deepEqual(reopened.scene, created.scene, 'reopened scene preserves its manual geometry and measurement evidence');

    const deleteResponse = await fetch(`${await app.getUrl()}/api/projects/${created.id}`, { method: 'DELETE', headers: { origin: publicOrigin } });
    assert.equal(deleteResponse.status, 204, 'trusted public origin can delete without login');
    const deletedGet = await fetch(`${await app.getUrl()}/api/projects/${created.id}`, {});
    assert.equal(deletedGet.status, 404, 'a deleted project is no longer readable');
    const deletedList = await fetch(`${await app.getUrl()}/api/projects`, {});
    assert.equal((await deletedList.json()).projects.some((project) => project.id === created.id), false, 'a deleted project no longer appears in the shared list');
  } finally {
    if (app) await app.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
