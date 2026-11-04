import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { alignFromCorrespondences, projectRootPose, transformProjectPoint, withManualRotation, type SessionTransform } from './xr-project-logic.ts';

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

function renderedPoint(point: { x: number; z: number }, transform: SessionTransform) {
  const pose = projectRootPose(transform);
  const root = new THREE.Group();
  root.position.set(pose.position.x, pose.position.y, pose.position.z);
  root.rotation.y = pose.rotationY;
  root.updateMatrixWorld(true);
  return new THREE.Vector3(point.x, 0, point.z).applyMatrix4(root.matrixWorld);
}

test('the rendered plan lands on the marked points, not mirrored', () => {
  const correspondences = [
    { project: { x: 0, z: 0 }, session: { x: 4, y: 0, z: 3 } },
    { project: { x: 2, z: 0 }, session: { x: 4, y: 0, z: 5 } },
    { project: { x: 2, z: 1 }, session: { x: 3, y: 0, z: 5 } },
  ];
  const alignment = alignFromCorrespondences(correspondences);
  assert.ok(alignment);
  for (const { project, session } of correspondences) {
    const rendered = renderedPoint(project, alignment.transform);
    assert.ok(Math.hypot(rendered.x - session.x, rendered.z - session.z) < 1e-9, `${JSON.stringify(project)} caiu em ${rendered.toArray()}`);
  }
});

test('the reported residual is the distance seen on the rendered plan', () => {
  const correspondences = [
    { project: { x: 0, z: 0 }, session: { x: 1, y: 0, z: 1 } },
    { project: { x: 0, z: 4 }, session: { x: 5, y: 0, z: 1 } },
    { project: { x: 3, z: 4 }, session: { x: 5.6, y: 0, z: -2 } },
  ];
  const alignment = alignFromCorrespondences(correspondences);
  assert.ok(alignment);
  const rendered = renderedPoint(correspondences[2].project, alignment.transform);
  const seen = Math.hypot(rendered.x - correspondences[2].session.x, rendered.z - correspondences[2].session.z);
  assert.ok(Math.abs(seen - alignment.residualsMeters[2]) < 1e-9, `na tela ${seen}, informado ${alignment.residualsMeters[2]}`);
});

test('a positive manual turn keeps the direction of rotation.y', () => {
  const start: SessionTransform = { yawRadians: 0.4, translation: { x: 1, y: 0, z: 2 } };
  const turned = withManualRotation(start, Math.PI / 36);
  assert.ok(Math.abs(projectRootPose(turned).rotationY - (projectRootPose(start).rotationY + Math.PI / 36)) < 1e-12);
});
