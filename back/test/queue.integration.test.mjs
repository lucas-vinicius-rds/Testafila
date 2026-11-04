import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Nest persists valid queue commands and rejects altered geometry', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'testafila-queue-'));
  const previous = Object.fromEntries(['DATABASE_PATH', 'APP_ORIGIN'].map((key) => [key, process.env[key]]));
  process.env.DATABASE_PATH = path.join(tempDir, 'queue.sqlite');
  process.env.APP_ORIGIN = 'http://localhost:3000';
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/src/app.module.js');
  const { applyQueueCommand } = await import('../dist/core/domain/queue/index.js');
  const { migrateProjectScene } = await import('../dist/core/domain/queue/migration.js');
  let app;
  try {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const headers = { origin: process.env.APP_ORIGIN, 'content-type': 'application/json' };
    const now = new Date().toISOString();
    let scene = {
      schemaVersion: 1, units: 'meters', coordinateSystem: 'right-handed-y-up-xz-floor',
      environment: {
        perimeter: [{ id: 'room-a', x: 0, z: 0 }, { id: 'room-b', x: 10, z: 0 }, { id: 'room-c', x: 10, z: 8 }, { id: 'room-d', x: 0, z: 8 }],
        wallHeightMeters: 2.8, confirmedAt: now, measurement: { source: 'manual', recordedAt: now, checks: [] },
      },
      restrictedAreas: [], posts: [], belts: [], routes: [], people: [],
      simulation: { spacingMeters: 0.8, personHeightMeters: 1.7, personRadiusMeters: 0.22, clearanceMeters: 0.05 },
    };
    scene = migrateProjectScene(scene);
    const commands = [
      { type: 'area:add', area: { id: 'zone', name: 'Balcão', vertices: [{ id: 'zone-a', x: 4, z: 5 }, { id: 'zone-b', x: 6, z: 5 }, { id: 'zone-c', x: 6, z: 7 }, { id: 'zone-d', x: 4, z: 7 }] } },
      { type: 'post:add', post: { id: 'post-a', position: { x: 1, z: 1 }, heightMeters: 0.95, baseRadiusMeters: 0.16 } },
      { type: 'post:add', post: { id: 'post-b', position: { x: 8, z: 1 }, heightMeters: 0.95, baseRadiusMeters: 0.16 } },
      { type: 'belt:add', belt: { id: 'belt', fromPostId: 'post-a', toPostId: 'post-b', heightMeters: 0.86 } },
      { type: 'route:set', route: { id: 'route', points: [{ id: 'route-a', x: 1, z: 3 }, { id: 'route-b', x: 8, z: 3 }] } },
      { type: 'people:fill', routeId: 'route', idPrefix: 'occupant' },
    ];
    for (const command of commands) {
      const result = applyQueueCommand(scene, command);
      assert.equal(result.valid, true, result.errors.join('; '));
      scene = result.scene;
    }
    assert.equal(scene.people.length, 9);
    // Preserve legacy route coverage through the API's transitional v1 input.
    const legacyInputScene = { ...scene, schemaVersion: 1 };
    delete legacyInputScene.queue;
    const input = { name: 'Fila integrada', scene: legacyInputScene, expectedRevision: null };
    const createdResponse = await fetch(`${base}/api/projects`, { method: 'POST', headers, body: JSON.stringify(input) });
    const createdBody = await createdResponse.text();
    assert.equal(createdResponse.status, 201, createdBody);
    const created = JSON.parse(createdBody);
    assert.deepEqual(created.scene, scene);

    const invalidScenes = [];
    const zoneCollision = structuredClone(scene); zoneCollision.posts[0].position = { x: 5, z: 6 }; invalidScenes.push(zoneCollision);
    const wrongPerson = structuredClone(scene); wrongPerson.people[0].position.x += 0.3; invalidScenes.push(wrongPerson);
    const outsideRoute = structuredClone(scene); outsideRoute.routes[0].points[0].x = -1; invalidScenes.push(outsideRoute);
    const reverseBelt = structuredClone(scene); reverseBelt.belts.push({ ...reverseBelt.belts[0], id: 'reverse-belt', fromPostId: 'post-b', toPostId: 'post-a' }); invalidScenes.push(reverseBelt);
    const repeatedBelt = structuredClone(scene); repeatedBelt.belts.push({ ...repeatedBelt.belts[0], id: 'same-direction-belt' }); invalidScenes.push(repeatedBelt);
    const beltThroughZone = structuredClone(scene);
    beltThroughZone.restrictedAreas[0].vertices = [
      { id: 'zone-a', x: 4, z: 0.8 }, { id: 'zone-b', x: 6, z: 0.8 },
      { id: 'zone-c', x: 6, z: 1.2 }, { id: 'zone-d', x: 4, z: 1.2 },
    ];
    invalidScenes.push(beltThroughZone);
    const noWallClearance = structuredClone(scene); noWallClearance.posts[0].position.x = 0.18; invalidScenes.push(noWallClearance);
    const outsideConcavity = structuredClone(scene);
    outsideConcavity.posts = []; outsideConcavity.belts = []; outsideConcavity.routes = []; outsideConcavity.people = [];
    outsideConcavity.environment.perimeter = [
      { id: 'room-a', x: 0, z: 0 }, { id: 'room-b', x: 8, z: 0 }, { id: 'room-c', x: 8, z: 3 },
      { id: 'room-d', x: 3, z: 3 }, { id: 'room-e', x: 3, z: 8 }, { id: 'room-f', x: 0, z: 8 },
    ];
    outsideConcavity.restrictedAreas[0].vertices = [
      { id: 'zone-a', x: 1, z: 6 }, { id: 'zone-b', x: 6, z: 1 }, { id: 'zone-c', x: 1, z: 1 },
    ];
    invalidScenes.push(outsideConcavity);
    const overlappingPeople = structuredClone(scene); overlappingPeople.people[1] = { ...overlappingPeople.people[0], id: overlappingPeople.people[1].id }; invalidScenes.push(overlappingPeople);
    for (const invalidScene of invalidScenes) {
      const response = await fetch(`${base}/api/projects/${created.id}`, {
        method: 'PATCH', headers, body: JSON.stringify({ ...input, scene: invalidScene, expectedRevision: 1 }),
      });
      assert.equal(response.status, 400, await response.text());
    }
    const afterInvalid = await fetch(`${base}/api/projects/${created.id}`, {});
    const unchanged = await afterInvalid.json();
    assert.equal(unchanged.revision, 1, 'invalid edits must not change the database revision');
    assert.deepEqual(unchanged.scene, scene);

    const redistributed = applyQueueCommand(scene, { type: 'simulation:spacing', spacingMeters: 1 });
    assert.equal(redistributed.valid, true, redistributed.errors.join('; '));
    assert.equal(redistributed.scene.people.length, 8);
    const update = await fetch(`${base}/api/projects/${created.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ ...input, scene: redistributed.scene, expectedRevision: 1 }),
    });
    assert.equal(update.status, 200, await update.text());

    // The visual editor starts a connected chain without inventing a route.
    let freeScene = { ...scene, restrictedAreas: [], posts: [], belts: [], routes: [], people: [] };
    const placeFree = applyQueueCommand(freeScene, {
      type: 'person:add',
      person: { id: 'free-a', routeId: null, distanceAlongRouteMeters: null, position: { x: 2, z: 3 }, yawRadians: 0 },
    });
    assert.equal(placeFree.valid, true, placeFree.errors.join('; '));
    freeScene = placeFree.scene;
    const freeCreateResponse = await fetch(`${base}/api/projects`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'Fila visual sem percurso', scene: freeScene, expectedRevision: null }),
    });
    assert.equal(freeCreateResponse.status, 201, await freeCreateResponse.clone().text());
    const freeProject = await freeCreateResponse.json();
    for (const inconsistent of [
      { ...freeScene.people[0], distanceAlongRouteMeters: 0 },
      { ...freeScene.people[0], routeId: 'missing-route' },
    ]) {
      const response = await fetch(`${base}/api/projects/${freeProject.id}`, {
        method: 'PATCH', headers, body: JSON.stringify({ name: freeProject.name, scene: { ...freeScene, people: [inconsistent] }, expectedRevision: 1 }),
      });
      assert.equal(response.status, 400, 'free person route and distance must both be null');
    }
    for (const command of [
      { type: 'person:rotate', id: 'free-a', yawRadians: Math.PI / 2 },
      { type: 'person:append', sourceId: 'free-a', id: 'free-b' },
      { type: 'person:move', id: 'free-a', position: { x: 3, z: 4 } },
      { type: 'person:rotate', id: 'free-a', yawRadians: -Math.PI / 2 },
    ]) {
      const result = applyQueueCommand(freeScene, command);
      assert.equal(result.valid, true, result.errors.join('; '));
      freeScene = result.scene;
    }
    assert.equal(freeScene.routes.length, 0);
    assert.deepEqual(freeScene.queue.personIds, ['free-a', 'free-b']);
    assert.ok(Math.abs(freeScene.people[1].position.x - 3.8) < 1e-7, 'moving/rotating the first person moves the connected tail behind -X');
    assert.ok(Math.abs(freeScene.people[1].position.z - 4) < 1e-7);
    const freeUpdate = await fetch(`${base}/api/projects/${freeProject.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ name: freeProject.name, scene: freeScene, expectedRevision: 1 }),
    });
    assert.equal(freeUpdate.status, 200, await freeUpdate.text());
    await app.close();
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    const reopenedResponse = await fetch(`${await app.getUrl()}/api/projects/${created.id}`, {});
    assert.equal(reopenedResponse.status, 200);
    const reopened = await reopenedResponse.json();
    assert.equal(reopened.revision, 2);
    assert.deepEqual(reopened.scene, redistributed.scene, 'all queue entities survive a Nest restart');
    const reopenedFreeResponse = await fetch(`${await app.getUrl()}/api/projects/${freeProject.id}`, {});
    assert.equal(reopenedFreeResponse.status, 200);
    const reopenedFree = await reopenedFreeResponse.json();
    assert.equal(reopenedFree.revision, 2);
    assert.deepEqual(reopenedFree.scene, freeScene, 'free placement, movement and rotation survive a Nest restart');
  } finally {
    if (app) await app.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
