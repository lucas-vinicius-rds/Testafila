import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectScene, validateSaveProjectInput } from '../dist/src/modules/projects/validation.js';
import { AppError } from '../dist/src/common/types.js';

function createValidScene() {
  return {
    schemaVersion: 2,
    queue: { personIds: [] },
    units: 'meters',
    coordinateSystem: 'right-handed-y-up-xz-floor',
    environment: {
      perimeter: [
        { id: 'v1', x: 0, z: 0 },
        { id: 'v2', x: 10, z: 0 },
        { id: 'v3', x: 10, z: 10 },
        { id: 'v4', x: 0, z: 10 },
      ],
      wallHeightMeters: 3.0,
      measurement: {
        source: 'manual',
        recordedAt: '2026-10-22T19:00:00Z',
        observedErrorPercent: 0,
        checks: [
          { fromVertexId: 'v1', toVertexId: 'v2', measuredMeters: 10.0 },
        ],
      },
      confirmedAt: '2026-10-22T19:00:00Z',
    },
    restrictedAreas: [
      {
        id: 'ra1',
        name: 'Balcão de Atendimento',
        vertices: [
          { id: 'ra_v1', x: 2, z: 2 },
          { id: 'ra_v2', x: 4, z: 2 },
          { id: 'ra_v3', x: 4, z: 4 },
        ],
      },
    ],
    posts: [
      { id: 'p1', position: { x: 1, z: 1 }, heightMeters: 1.0, baseRadiusMeters: 0.15 },
      { id: 'p2', position: { x: 1, z: 5 }, heightMeters: 1.0, baseRadiusMeters: 0.15 },
    ],
    belts: [
      { id: 'b1', fromPostId: 'p1', toPostId: 'p2', heightMeters: 0.9 },
    ],
    routes: [
      {
        id: 'r1',
        points: [
          { id: 'rp1', x: 1.6, z: 1 },
          { id: 'rp2', x: 1.6, z: 5 },
        ],
      },
    ],
    people: [
      {
        id: 'person1',
        routeId: 'r1',
        distanceAlongRouteMeters: 0.5,
        position: { x: 1.6, z: 1.5 },
        yawRadians: 0,
      },
    ],
    simulation: {
      spacingMeters: 0.8,
      personHeightMeters: 1.75,
      personRadiusMeters: 0.25,
      clearanceMeters: 0.1,
    },
  };
}

test('Scene and Input Validation', async (t) => {
  await t.test('accepts valid scene conforming to contracts/project.ts', () => {
    const scene = createValidScene();
    assert.doesNotThrow(() => validateProjectScene(scene));
  });

  await t.test('rejects invalid schemaVersion and units', () => {
    const scene = createValidScene();
    scene.schemaVersion = 999;
    assert.throws(() => validateProjectScene(scene), (err) => err instanceof AppError && err.statusCode === 400);

    scene.schemaVersion = 1;
    scene.units = 'feet';
    assert.throws(() => validateProjectScene(scene), (err) => err instanceof AppError && err.statusCode === 400);
  });

  await t.test('rejects perimeter with fewer than 3 vertices', () => {
    const scene = createValidScene();
    scene.environment.perimeter = [
      { id: 'v1', x: 0, z: 0 },
      { id: 'v2', x: 10, z: 0 },
    ];
    assert.throws(() => validateProjectScene(scene), (err) => err instanceof AppError && err.statusCode === 400);
  });

  await t.test('rejects belt connecting non-existent posts or same post', () => {
    const scene = createValidScene();
    scene.belts = [{ id: 'b1', fromPostId: 'p1', toPostId: 'p999', heightMeters: 0.9 }];
    assert.throws(() => validateProjectScene(scene), (err) => err instanceof AppError && err.statusCode === 400);

    scene.belts = [{ id: 'b1', fromPostId: 'p1', toPostId: 'p1', heightMeters: 0.9 }];
    assert.throws(() => validateProjectScene(scene), (err) => err instanceof AppError && err.statusCode === 400);
  });

  await t.test('validates SaveProjectInput creation vs update expectedRevision', () => {
    const scene = createValidScene();
    scene.people = [];

    // Creation with expectedRevision null -> valid
    const validCreation = validateSaveProjectInput({ name: 'Fila A', scene, expectedRevision: null }, true);
    assert.equal(validCreation.expectedRevision, null);

    // Creation with expectedRevision number -> rejected
    assert.throws(() => {
      validateSaveProjectInput({ name: 'Fila A', scene, expectedRevision: 1 }, true);
    }, (err) => err instanceof AppError && err.statusCode === 400);

    // Update with expectedRevision number -> valid
    const validUpdate = validateSaveProjectInput({ name: 'Fila A', scene, expectedRevision: 2 }, false);
    assert.equal(validUpdate.expectedRevision, 2);

    // Update with expectedRevision null -> rejected
    assert.throws(() => {
      validateSaveProjectInput({ name: 'Fila A', scene, expectedRevision: null }, false);
    }, (err) => err instanceof AppError && err.statusCode === 400);
  });
});
