import assert from 'node:assert/strict';
import test from 'node:test';
import { alignFromCorrespondences, transformProjectPoint } from './xr-project-logic.ts';

test('fits yaw and translation without changing scale', () => {
  const alignment = alignFromCorrespondences([
    { project: { x: 0, z: 0 }, session: { x: 4, y: 0, z: 3 } },
    { project: { x: 2, z: 0 }, session: { x: 4, y: 0, z: 5 } },
    { project: { x: 2, z: 1 }, session: { x: 3, y: 0, z: 5 } },
  ]);
  assert.ok(alignment);
  assert.ok(Math.abs(alignment.transform.yawRadians - Math.PI / 2) < 1e-10);
  assert.deepEqual(transformProjectPoint({ x: 2, z: 1 }, alignment.transform), { x: 3, y: 0, z: 5 });
  assert.equal(alignment.maxResidualMeters, 0);
  assert.equal(alignment.fitDimensionErrorPercent, 0);
});

test('reports a third-point residual instead of scaling the project', () => {
  const alignment = alignFromCorrespondences([
    { project: { x: 0, z: 0 }, session: { x: 1, y: 0, z: 1 } },
    { project: { x: 4, z: 0 }, session: { x: 5, y: 0, z: 1 } },
    { project: { x: 4, z: 3 }, session: { x: 5.6, y: 0, z: 4 } },
  ]);
  assert.ok(alignment);
  assert.equal(alignment.fitDimensionErrorPercent, 0);
  assert.ok(Math.abs(alignment.residualsMeters[2] - 0.6) < 1e-10);
});

test('requires two distinct finite correspondences', () => {
  assert.equal(alignFromCorrespondences([]), null);
  assert.equal(alignFromCorrespondences([
    { project: { x: 1, z: 1 }, session: { x: 0, y: 0, z: 0 } },
    { project: { x: 1, z: 1 }, session: { x: 1, y: 0, z: 0 } },
  ]), null);
});
