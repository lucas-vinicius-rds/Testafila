import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function legacyScene() {
  return {
    schemaVersion: 1, units: 'meters', coordinateSystem: 'right-handed-y-up-xz-floor',
    environment: {
      perimeter: [{ id: 'v-a', x: 0, z: 0 }, { id: 'v-b', x: 12, z: 0 }, { id: 'v-c', x: 12, z: 10 }, { id: 'v-d', x: 0, z: 10 }],
      wallHeightMeters: 2.8, confirmedAt: null,
      measurement: { source: 'manual', recordedAt: '2026-11-04T12:00:00Z', checks: [] },
    },
    restrictedAreas: [], posts: [], belts: [], routes: [], people: [],
    simulation: { spacingMeters: 0.8, personHeightMeters: 1.7, personRadiusMeters: 0.22, clearanceMeters: 0.05 },
  };
}

test('Nest scene versions: connected chain, legacy reads and atomic revisions', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'testafila-versions-'));
  const previous = { DATABASE_PATH: process.env.DATABASE_PATH, APP_ORIGIN: process.env.APP_ORIGIN };
  process.env.DATABASE_PATH = path.join(tempDir, 'versions.sqlite');
  process.env.APP_ORIGIN = 'http://localhost:3000';
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/src/app.module.js');
  const { DatabaseService } = await import('../dist/src/infra/database/database.service.js');
  const { applyQueueCommand } = await import('../dist/core/domain/queue/index.js');
  const { migrateProjectScene } = await import('../dist/core/domain/queue/migration.js');
  const headers = { origin: process.env.APP_ORIGIN, 'content-type': 'application/json' };
  let app;
  let base;
  let chainProject;
  let chainScene;

  async function start() {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }
  function db() { return app.get(DatabaseService); }
  function row(id) { return db().prepare('SELECT * FROM projects WHERE id = ?').get(id); }
  function command(scene, value) {
    const result = applyQueueCommand(scene, value);
    assert.equal(result.valid, true, result.errors.join('; '));
    return result.scene;
  }
  async function write(method, suffix, body) {
    return fetch(base + '/api/projects' + suffix, { method, headers, body: JSON.stringify(body) });
  }
  function seed(id, sceneText) {
    const time = '2026-10-22T12:00:00Z';
    db().prepare('INSERT INTO projects (id, owner_id, name, created_at, updated_at, revision, schema_version, scene, preview_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, 'local-project-owner', 'Legacy fixture', time, time, 7, 1, sceneText, 'legacy-preview');
  }

  try {
    await start();
    await t.test('creates a v2 chain, updates spacing and reopens the exact chain after restart', async () => {
      chainScene = migrateProjectScene(legacyScene());
      chainScene = command(chainScene, { type: 'person:add', person: { id: 'p1', routeId: null, distanceAlongRouteMeters: null, position: { x: 6, z: 7 }, yawRadians: 0 } });
      chainScene = command(chainScene, { type: 'person:append', id: 'p2' });
      chainScene = command(chainScene, { type: 'person:append', id: 'p3' });
      assert.deepEqual(chainScene.queue.personIds, ['p1', 'p2', 'p3']);
      const created = await write('POST', '', { name: 'Connected queue', scene: chainScene, expectedRevision: null });
      assert.equal(created.status, 201, await created.clone().text());
      chainProject = await created.json();
      assert.deepEqual(chainProject.scene, chainScene);
      assert.equal(row(chainProject.id).schema_version, 2);
      assert.equal(JSON.parse(row(chainProject.id).scene).schemaVersion, 2);

      chainScene = command(chainScene, { type: 'simulation:spacing', spacingMeters: 1 });
      chainScene = command(chainScene, { type: 'person:rotate', id: 'p2', yawRadians: Math.PI / 2 });
      for (let index = 1; index < chainScene.queue.personIds.length; index++) {
        const before = chainScene.people.find((person) => person.id === chainScene.queue.personIds[index - 1]);
        const after = chainScene.people.find((person) => person.id === chainScene.queue.personIds[index]);
        assert.ok(Math.abs(Math.hypot(before.position.x - after.position.x, before.position.z - after.position.z) - 1) < 1e-7);
      }
      const updated = await write('PATCH', '/' + chainProject.id, { name: 'Connected queue updated', scene: chainScene, expectedRevision: 1 });
      assert.equal(updated.status, 200, await updated.clone().text());
      assert.equal((await updated.json()).revision, 2);
      assert.equal(row(chainProject.id).schema_version, 2);
      await app.close();
      await start();
      const reopened = await fetch(base + '/api/projects/' + chainProject.id);
      assert.equal(reopened.status, 200);
      const saved = await reopened.json();
      assert.equal(saved.revision, 2);
      assert.deepEqual(saved.scene, chainScene);
    });

    await t.test('rejects inconsistent membership, wrong spacing and stale revisions without writes', async () => {
      const before = row(chainProject.id);
      const missingMember = structuredClone(chainScene); missingMember.queue.personIds.pop();
      const duplicatedMember = structuredClone(chainScene); duplicatedMember.queue.personIds[1] = 'p1';
      const unknownMember = structuredClone(chainScene); unknownMember.queue.personIds[1] = 'missing-person';
      const wrongSpacing = structuredClone(chainScene); wrongSpacing.people[2].position.x -= 0.3;
      const outsideChain = structuredClone(chainScene); outsideChain.people.push({ id: 'orphan', routeId: null, distanceAlongRouteMeters: null, position: { x: 2, z: 2 }, yawRadians: 0 });
      for (const scene of [missingMember, duplicatedMember, unknownMember, wrongSpacing, outsideChain]) {
        const response = await write('PATCH', '/' + chainProject.id, { name: 'Invalid change', scene, expectedRevision: 2 });
        assert.equal(response.status, 400, await response.clone().text());
        assert.deepEqual(row(chainProject.id), before);
      }
      const conflict = await write('PATCH', '/' + chainProject.id, { name: 'Stale change', scene: chainScene, expectedRevision: 1 });
      assert.equal(conflict.status, 409);
      assert.deepEqual(row(chainProject.id), before);
    });

    await t.test('reads v1 repeatedly as v2 without converting people or rewriting the stored row', async () => {
      const legacy = legacyScene();
      legacy.people = [
        { id: 'old-a', routeId: null, distanceAlongRouteMeters: null, position: { x: 2, z: 4 }, yawRadians: 0 },
        { id: 'old-b', routeId: null, distanceAlongRouteMeters: null, position: { x: 2, z: 2.4 }, yawRadians: 0 },
      ];
      seed('legacy-record', JSON.stringify(legacy, null, 2));
      const before = row('legacy-record');
      const writesBefore = db().prepare('SELECT total_changes() AS count').get().count;
      for (let index = 0; index < 2; index++) {
        const response = await fetch(base + '/api/projects/legacy-record');
        assert.equal(response.status, 200);
        const opened = await response.json();
        assert.equal(opened.scene.schemaVersion, 2);
        assert.deepEqual(opened.scene.queue, { personIds: [] });
        assert.deepEqual(opened.scene.people, legacy.people, 'reading never converts or moves legacy people');
        assert.deepEqual(opened.scene.environment, legacy.environment);
        assert.equal(opened.revision, 7);
      }
      await fetch(base + '/api/projects');
      assert.equal(db().prepare('SELECT total_changes() AS count').get().count, writesBefore, 'GET must execute no SQLite write');
      assert.deepEqual(row('legacy-record'), before, 'scene JSON bytes, schema column and metadata stay unchanged');

      const converted = command(migrateProjectScene(legacy), { type: 'queue:convert-legacy' });
      const update = await write('PATCH', '/legacy-record', { name: 'Explicitly converted', scene: converted, expectedRevision: 7 });
      assert.equal(update.status, 200, await update.clone().text());
      const saved = await update.json();
      assert.equal(saved.revision, 8);
      assert.deepEqual(saved.scene.queue.personIds, ['old-a', 'old-b']);
      assert.equal(row('legacy-record').schema_version, 2, 'only explicit save upgrades the schema column');
      assert.deepEqual(JSON.parse(row('legacy-record').scene), saved.scene);
    });

    await t.test('rejects v1 saves and new v2 projects containing unlinked people without changing stored rows', async () => {
      const legacy = legacyScene();
      legacy.people = [{ id: 'legacy-person', routeId: null, distanceAlongRouteMeters: null, position: { x: 2, z: 4 }, yawRadians: 0 }];
      const countBefore = db().prepare('SELECT COUNT(*) AS count FROM projects').get().count;
      const rejectedCreate = await write('POST', '', { name: 'Obsolete v1 client', scene: legacy, expectedRevision: null });
      assert.equal(rejectedCreate.status, 400, await rejectedCreate.clone().text());
      assert.equal(db().prepare('SELECT COUNT(*) AS count FROM projects').get().count, countBefore);
      const before = row(chainProject.id);
      const rejectedUpdate = await write('PATCH', '/' + chainProject.id, { name: 'Obsolete update', scene: legacy, expectedRevision: before.revision });
      assert.equal(rejectedUpdate.status, 400, await rejectedUpdate.clone().text());
      assert.deepEqual(row(chainProject.id), before);
      const rejected = await write('POST', '', { name: 'New unlinked v2', scene: migrateProjectScene(legacy), expectedRevision: null });
      assert.equal(rejected.status, 400, await rejected.clone().text());
    });

    await t.test('maps both malformed stored JSON and unsupported stored schema to the same 500 without rewriting', async () => {
      for (const [id, text] of [['bad-json', '{'], ['bad-version', JSON.stringify({ schemaVersion: 999 })]]) {
        seed(id, text);
        const before = row(id);
        const response = await fetch(base + '/api/projects/' + id);
        assert.equal(response.status, 500);
        const body = await response.json();
        assert.equal(body.error.code, 'INTERNAL_SERVER_ERROR');
        assert.equal(body.error.message, 'Erro ao ler dados da cena do projeto');
        assert.deepEqual(row(id), before);
      }
    });
  } finally {
    if (app) await app.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    // mkdtemp created this task-specific directory; never target back/data.
    assert.equal(path.dirname(tempDir), os.tmpdir());
    assert.ok(path.basename(tempDir).startsWith('testafila-versions-'));
    await rm(tempDir, { recursive: true, force: true });
  }
});
