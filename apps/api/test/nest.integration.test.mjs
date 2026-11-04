import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Better Auth and project flows run through the Nest application', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'testafila-api-'));
  const previous = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    APP_ORIGIN: process.env.APP_ORIGIN,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  };
  process.env.DATABASE_PATH = path.join(tempDir, 'integration.sqlite');
  process.env.APP_ORIGIN = 'http://localhost:3000';
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  process.env.BETTER_AUTH_SECRET = 'integration-only-secret-with-at-least-32-chars';

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/apps/api/src/app.module.js');
  const { AuthService } = await import('../dist/apps/api/src/auth/auth.service.js');
  const { DatabaseService } = await import('../dist/apps/api/src/database/database.service.js');

  async function startApp() {
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    return { app, base: await app.getUrl() };
  }

  let app;
  try {
    ({ app } = await startApp());
    const db = app.get(DatabaseService);
    const { createAuth } = await import('../dist/apps/api/src/auth/auth.service.js');
    const provisioningAuth = createAuth(db, { allowProvisioning: true });
    const passwordA = 'Temp-' + crypto.randomUUID() + '-Aa9!';
    const passwordB = 'Temp-' + crypto.randomUUID() + '-Bb8!';
    const emailA = `a-${crypto.randomUUID()}@test.invalid`;
    const emailB = `b-${crypto.randomUUID()}@test.invalid`;
    await provisioningAuth.api.signUpEmail({ body: { name: 'Owner A', email: emailA, password: passwordA } });
    await provisioningAuth.api.signUpEmail({ body: { name: 'Owner B', email: emailB, password: passwordB } });

    const base = await app.getUrl();
    async function login(email, password) {
      const response = await fetch(`${base}/api/auth/sign-in/email`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: process.env.APP_ORIGIN },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(response.status, 200, await response.text());
      const cookieHeader = response.headers.get('set-cookie') ?? '';
      const cookie = cookieHeader.match(/(?:__Secure-)?better-auth\.session_token=[^;,]+/)?.[0];
      assert.ok(cookie, 'Better Auth should set its session cookie');
      return cookie;
    }

    const cookieA = await login(emailA, passwordA);
    const cookieB = await login(emailB, passwordB);
    const publicSignup = await fetch(`${base}/api/auth/sign-up/email`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: process.env.APP_ORIGIN },
      body: JSON.stringify({ name: 'Public Signup', email: `public-${crypto.randomUUID()}@test.invalid`, password: 'Temp-Public-Aa9!' }),
    });
    assert.notEqual(publicSignup.status, 200, 'public signup remains disabled');
    const session = await fetch(`${base}/api/auth/get-session`, { headers: { cookie: cookieA } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).user.email, emailA);

    const scene = {
      schemaVersion: 1, units: 'meters', coordinateSystem: 'right-handed-y-up-xz-floor',
      environment: { perimeter: [{ id: 'v1', x: 0, z: 0 }, { id: 'v2', x: 5, z: 0 }, { id: 'v3', x: 5, z: 5 }, { id: 'v4', x: 0, z: 5 }], wallHeightMeters: 3, measurement: { source: 'manual', recordedAt: new Date().toISOString(), checks: [] }, confirmedAt: null },
      restrictedAreas: [], posts: [], belts: [], routes: [], people: [],
      simulation: { spacingMeters: 0.8, personHeightMeters: 1.7, personRadiusMeters: 0.25, clearanceMeters: 0.1 },
    };
    const input = { name: 'Integration project', scene, expectedRevision: null };
    const rejected = await fetch(`${base}/api/projects`, { method: 'POST', headers: { cookie: cookieA, origin: 'https://attacker.invalid', 'content-type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(rejected.status, 403, 'mutations reject untrusted origins');

    const createdResponse = await fetch(`${base}/api/projects`, { method: 'POST', headers: { cookie: cookieA, origin: process.env.APP_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(input) });
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
      const response = await fetch(`${base}/api/projects`, { method: 'POST', headers: { cookie: cookieA, origin: process.env.APP_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ ...input, scene: invalidScene }) });
      assert.equal(response.status, 400, 'malformed and geometrically invalid scenes return 400');
    }

    const measuredScene = structuredClone(scene);
    measuredScene.environment.measurement.checks = [{ fromVertexId: 'v1', toVertexId: 'v2', measuredMeters: 4 }];
    const measuredSave = await fetch(`${base}/api/projects`, { method: 'POST', headers: { cookie: cookieA, origin: process.env.APP_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ ...input, name: 'Measured floor plan', scene: measuredScene }) });
    assert.equal(measuredSave.status, 201);
    const measured = await measuredSave.json();
    assert.equal(measured.scene.environment.measurement.observedErrorPercent, 25, 'error is derived from independent measurement checks');

    const tooLarge = await fetch(`${base}/api/projects`, { method: 'POST', headers: { cookie: cookieA, origin: process.env.APP_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ ...input, extra: 'x'.repeat(110_000) }) });
    assert.equal(tooLarge.status, 413, 'oversized JSON body is rejected before project validation');
    assert.equal((await tooLarge.json()).error.code, 'PAYLOAD_TOO_LARGE');
    const malformedJson = await fetch(`${base}/api/projects`, { method: 'POST', headers: { cookie: cookieA, origin: process.env.APP_ORIGIN, 'content-type': 'application/json' }, body: '{"scene":' });
    assert.equal(malformedJson.status, 400, 'malformed JSON keeps its client error status under the production filter');
    assert.equal((await malformedJson.json()).error.code, 'BAD_REQUEST');

    const hidden = await fetch(`${base}/api/projects/${created.id}`, { headers: { cookie: cookieB } });
    assert.equal(hidden.status, 404, 'another owner cannot read the project');
    const hiddenWrite = await fetch(`${base}/api/projects/${created.id}`, { method: 'PATCH', headers: { cookie: cookieB, origin: process.env.APP_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ ...input, expectedRevision: 1 }) });
    assert.equal(hiddenWrite.status, 404, 'another owner cannot update the project');
    const hiddenDelete = await fetch(`${base}/api/projects/${created.id}`, { method: 'DELETE', headers: { cookie: cookieB, origin: process.env.APP_ORIGIN } });
    assert.equal(hiddenDelete.status, 404, 'another owner cannot delete the project');
    const preservedAfterHiddenDelete = await fetch(`${base}/api/projects/${created.id}`, { headers: { cookie: cookieA } });
    assert.equal(preservedAfterHiddenDelete.status, 200, 'a rejected cross-owner delete preserves the project');

    const conflict = await fetch(`${base}/api/projects/${created.id}`, { method: 'PATCH', headers: { cookie: cookieA, origin: process.env.APP_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ ...input, expectedRevision: 7 }) });
    assert.equal(conflict.status, 409);

    await app.close();
    ({ app } = await startApp());
    const persisted = await fetch(`${await app.getUrl()}/api/projects`, { headers: { cookie: cookieA } });
    assert.equal(persisted.status, 200);
    assert.ok((await persisted.json()).projects.some((project) => project.id === created.id), 'project survives a Nest restart');
    const reopenedResponse = await fetch(`${await app.getUrl()}/api/projects/${created.id}`, { headers: { cookie: cookieA } });
    assert.equal(reopenedResponse.status, 200);
    const reopened = await reopenedResponse.json();
    assert.deepEqual(reopened.scene, created.scene, 'reopened scene preserves its manual geometry and measurement evidence');

    const deleteResponse = await fetch(`${await app.getUrl()}/api/projects/${created.id}`, { method: 'DELETE', headers: { cookie: cookieA, origin: process.env.APP_ORIGIN } });
    assert.equal(deleteResponse.status, 204, 'the owner can delete the project');
    const deletedGet = await fetch(`${await app.getUrl()}/api/projects/${created.id}`, { headers: { cookie: cookieA } });
    assert.equal(deletedGet.status, 404, 'a deleted project is no longer readable');
    const deletedList = await fetch(`${await app.getUrl()}/api/projects`, { headers: { cookie: cookieA } });
    assert.equal((await deletedList.json()).projects.some((project) => project.id === created.id), false, 'a deleted project no longer appears in the owner list');
  } finally {
    if (app) await app.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
