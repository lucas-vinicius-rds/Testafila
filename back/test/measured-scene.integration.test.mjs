import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
// The capture factory is consumed by the frontend, not emitted in Nest's dependency graph.
import { createEnvironmentFromMeasuredPoints } from '../core/domain/measured-environment.ts';

test('Nest accepts the measured-environment contract without persisting session coordinates', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'testafila-measured-api-'));
  const previous = { DATABASE_PATH: process.env.DATABASE_PATH, APP_ORIGIN: process.env.APP_ORIGIN };
  process.env.DATABASE_PATH = path.join(tempDir, 'measured.sqlite');
  process.env.APP_ORIGIN = 'http://localhost:3000';
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/src/app.module.js');
  const { DatabaseService } = await import('../dist/src/infra/database/database.service.js');
  const { applyQueueCommand } = await import('../dist/core/domain/queue/index.js');
  const recordedAt = '2026-11-04T15:00:00Z';
  // A translated, rotated rectangle in session XZ, measured in meters.
  const points = [{ x: 10, z: -3 }, { x: 10, z: 9 }, { x: 2, z: 9 }, { x: 2, z: -3 }];
  const headers = { origin: process.env.APP_ORIGIN, 'content-type': 'application/json' };
  let app;
  let base;
  let scene;
  let projectId;

  async function start() {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }
  async function save(method, suffix, value) {
    return fetch(base + '/api/projects' + suffix, { method, headers, body: JSON.stringify(value) });
  }
  function db() { return app.get(DatabaseService); }
  function row() { return db().prepare('SELECT * FROM projects WHERE id = ?').get(projectId); }

  try {
    await start();
    await t.test('builds from measured points, saves all queue entities and reopens the exact scene after restart', async () => {
      const measured = createEnvironmentFromMeasuredPoints({ points, recordedAt });
      assert.equal(measured.valid, true, measured.errors.join('; '));
      assert.deepEqual(measured.environment.perimeter[0], { id: 'corner-1', x: 0, z: 0 });
      assert.ok(Math.abs(measured.environment.perimeter[1].x - 12) < 1e-7);
      assert.ok(Math.abs(measured.environment.perimeter[1].z) < 1e-7);
      assert.ok(Math.abs(measured.environment.perimeter[2].z - 8) < 1e-7, 'normalization preserves metric lengths without scale correction');
      assert.deepEqual(measured.sessionToProject.origin, points[0]);
      scene = {
        schemaVersion: 2, units: 'meters', coordinateSystem: 'right-handed-y-up-xz-floor',
        environment: measured.environment, restrictedAreas: [], posts: [], belts: [],
        routes: [], queue: { personIds: [] }, people: [],
        simulation: { spacingMeters: 0.8, personHeightMeters: 1.7, personRadiusMeters: 0.22, clearanceMeters: 0.05 },
      };
      for (const command of [
        { type: 'area:add', area: { id: 'area', name: 'Restricted', vertices: [{ id: 'area-a', x: 8, z: 5 }, { id: 'area-b', x: 10, z: 5 }, { id: 'area-c', x: 10, z: 7 }, { id: 'area-d', x: 8, z: 7 }] } },
        { type: 'post:add', post: { id: 'post-a', position: { x: 1, z: 1 }, heightMeters: 0.95, baseRadiusMeters: 0.08 } },
        { type: 'post:add', post: { id: 'post-b', position: { x: 10, z: 1 }, heightMeters: 0.95, baseRadiusMeters: 0.08 } },
        { type: 'belt:add', belt: { id: 'belt', fromPostId: 'post-a', toPostId: 'post-b', heightMeters: 0.86 } },
        { type: 'person:add', person: { id: 'person-a', routeId: null, distanceAlongRouteMeters: null, position: { x: 5, z: 6 }, yawRadians: 0 } },
        { type: 'person:append', id: 'person-b' },
      ]) {
        const result = applyQueueCommand(scene, command);
        assert.equal(result.valid, true, result.errors.join('; '));
        scene = result.scene;
      }
      const response = await save('POST', '', { name: 'Measured scene', scene, expectedRevision: null });
      assert.equal(response.status, 201, await response.clone().text());
      const created = await response.json();
      projectId = created.id;
      assert.equal(created.revision, 1);
      assert.deepEqual(created.scene, scene);
      assert.equal(created.scene.environment.measurement.source, 'webxr');
      assert.equal(created.scene.environment.measurement.recordedAt, recordedAt);
      assert.deepEqual(created.scene.environment.measurement.checks, []);
      assert.equal(created.scene.environment.measurement.observedErrorPercent, undefined, 'empty checks must not imply zero physical error');
      assert.equal(created.scene.environment.confirmedAt, null, 'capture does not imply user confirmation');
      assert.deepEqual(created.scene.queue.personIds, ['person-a', 'person-b']);
      assert.equal(row().schema_version, 2);
      assert.deepEqual(JSON.parse(row().scene), scene, 'only ProjectScene is persisted, not the session transform');
      assert.equal(Object.hasOwn(JSON.parse(row().scene), 'sessionToProject'), false);

      const adjusted = createEnvironmentFromMeasuredPoints({ points: [{ x: 10, z: -3 }, { x: 10, z: 11 }, { x: 2, z: 11 }, { x: 2, z: -3 }], recordedAt: '2026-11-04T15:01:00Z' });
      assert.equal(adjusted.valid, true, adjusted.errors.join('; '));
      scene = { ...scene, environment: adjusted.environment };
      const update = await save('PATCH', '/' + projectId, { name: 'Measured scene reviewed', scene, expectedRevision: 1 });
      assert.equal(update.status, 200, await update.clone().text());
      assert.equal((await update.json()).revision, 2);
      await app.close();
      await start();
      const read = await fetch(base + '/api/projects/' + projectId);
      assert.equal(read.status, 200);
      const reopened = await read.json();
      assert.equal(reopened.revision, 2);
      assert.deepEqual(reopened.scene, scene);
      assert.equal(reopened.scene.environment.measurement.source, 'webxr');
      assert.deepEqual(JSON.parse(row().scene), scene);
    });

    await t.test('rejects malformed measured environments on POST and PATCH without changing stored data', async () => {
      const selfIntersecting = structuredClone(scene.environment);
      const [a, b, c, d] = selfIntersecting.perimeter;
      selfIntersecting.perimeter = [a, c, b, d];
      const invalidDate = structuredClone(scene.environment); invalidDate.measurement.recordedAt = 'invalid';
      const duplicateCorner = structuredClone(scene.environment); duplicateCorner.perimeter[1] = { ...duplicateCorner.perimeter[0] };
      const nullCoordinate = structuredClone(scene.environment); nullCoordinate.perimeter[0].x = null;
      const sessionLeak = { ...scene.environment, sessionToProject: { origin: points[0], rotationRadians: 0 } };
      const before = row();
      const countBefore = db().prepare('SELECT COUNT(*) AS count FROM projects').get().count;
      for (const environment of [null, { ...scene.environment, perimeter: scene.environment.perimeter.slice(0, 2) }, selfIntersecting, invalidDate, duplicateCorner, nullCoordinate, sessionLeak]) {
        for (const [method, suffix, expectedRevision] of [['POST', '', null], ['PATCH', '/' + projectId, 2]]) {
          const response = await save(method, suffix, { name: 'Invalid capture', scene: { ...scene, environment }, expectedRevision });
          assert.equal(response.status, 400, await response.clone().text());
          assert.equal((await response.json()).error.code, 'BAD_REQUEST');
          assert.deepEqual(row(), before, 'rejected capture preserves JSON, revision and metadata');
          assert.equal(db().prepare('SELECT COUNT(*) AS count FROM projects').get().count, countBefore, 'invalid capture creates no project');
        }
      }
    });

    await t.test('the measured-points factory returns no environment for invalid capture inputs', () => {
      for (const input of [
        { points: points.slice(0, 2), recordedAt },
        { points: [points[0], points[0], points[2]], recordedAt },
        { points: [points[0], points[2], points[1], points[3]], recordedAt },
        { points: [{ x: NaN, z: 0 }, ...points.slice(1)], recordedAt },
        { points: [null, ...points.slice(1)], recordedAt },
        { points, recordedAt: 'invalid' },
      ]) {
        const result = createEnvironmentFromMeasuredPoints(input);
        assert.equal(result.valid, false);
        assert.ok(result.errors.length > 0);
        assert.equal(result.environment, null);
        assert.equal(result.sessionToProject, null);
      }
    });
  } finally {
    if (app) await app.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    assert.equal(path.dirname(tempDir), os.tmpdir());
    assert.ok(path.basename(tempDir).startsWith('testafila-measured-api-'));
    await rm(tempDir, { recursive: true, force: true });
  }
});
