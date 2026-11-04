import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRectangleEnvironment } from '../../domain/environment.ts';
import { getQueueMode, validateQueueScene } from '../../domain/queue/index.ts';
import { migrateProjectScene } from '../../domain/queue/migration.ts';

function sceneV1() {
  return {
    schemaVersion: 1,
    units: 'meters',
    coordinateSystem: 'right-handed-y-up-xz-floor',
    environment: createRectangleEnvironment({ widthMeters: 10, depthMeters: 8 }),
    restrictedAreas: [],
    posts: [],
    belts: [],
    routes: [],
    people: [
      { id: 'a', routeId: null, distanceAlongRouteMeters: null, position: { x: 2, z: 2 }, yawRadians: 0.5 },
      { id: 'b', routeId: null, distanceAlongRouteMeters: null, position: { x: 4, z: 3 }, yawRadians: 1 },
    ],
    simulation: { spacingMeters: 1, personHeightMeters: 1.7, personRadiusMeters: 0.2, clearanceMeters: 0.05 },
  };
}

describe('migração de cena', () => {
  it('leva v1 para v2 sem perder dados e sem converter pessoas', () => {
    const input = sceneV1();
    const scene = migrateProjectScene(input);
    const { schemaVersion, queue, ...rest } = scene;
    const { schemaVersion: _old, ...original } = input;
    assert.equal(schemaVersion, 2);
    assert.deepEqual(queue, { personIds: [] });
    assert.deepEqual(rest, original);
    assert.equal(getQueueMode(scene), 'legacy');
    assert.equal(validateQueueScene(scene).valid, true);
  });

  it('não muta a entrada', () => {
    const input = sceneV1();
    const snapshot = structuredClone(input);
    migrateProjectScene(input);
    assert.deepEqual(input, snapshot);
  });

  it('é idempotente: v2 volta como a mesma instância', () => {
    const scene = migrateProjectScene(sceneV1());
    assert.equal(migrateProjectScene(scene), scene);
  });

  it('rejeita versão desconhecida e entrada vazia', () => {
    for (const input of [{ schemaVersion: 3 }, { schemaVersion: '1' }, {}, null, undefined]) {
      assert.throws(() => migrateProjectScene(input), /incompatível/);
    }
  });
});
