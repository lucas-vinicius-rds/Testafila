import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { addCorner, canMarkCorner, closeFloorplan, closingWallMeters, floorDistanceMeters, formatMeters, projectRootPose, undoLastCorner, wallLengthsMeters } from './floorplan-capture-logic.ts';
import { sessionPointToProject } from '@testafila/core/domain/measured-environment';

const RECORDED_AT = '2026-11-04T12:00:00.000Z';
const hit = { x: 1, y: 0, z: 1 };

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);
}

function markAll(points: readonly (readonly [number, number])[]) {
  return points.map(([x, z]) => ({ x, y: 0, z }));
}

test('marking is blocked unless the session is visible with a floor hit', () => {
  assert.equal(canMarkCorner({ visible: true, tracking: 'surface', hit }), true);
  assert.equal(canMarkCorner({ visible: false, tracking: 'surface', hit }), false);
  assert.equal(canMarkCorner({ visible: true, tracking: 'lost', hit }), false);
  assert.equal(canMarkCorner({ visible: true, tracking: 'hidden', hit }), false);
  assert.equal(canMarkCorner({ visible: true, tracking: 'searching', hit }), false);
  assert.equal(canMarkCorner({ visible: true, tracking: 'surface', hit: null }), false);
});

test('walls are measured along the floor, in meters, without correction', () => {
  const [low, high] = [hit, { x: 4, y: 0.4, z: 5 }];
  assert.equal(floorDistanceMeters(low, high), 5);
  assert.deepEqual(wallLengthsMeters(markAll([[0, 0], [3, 0], [3, 4]])), [3, 4]);
  assert.deepEqual(wallLengthsMeters([]), []);
});

test('the closing wall only exists from three corners on', () => {
  assert.equal(closingWallMeters(markAll([[0, 0], [3, 0]])), null);
  assert.equal(closingWallMeters(markAll([[0, 0], [3, 0], [3, 4]])), 5);
});

test('a tap right on an existing corner is refused and keeps the corners', () => {
  const corners = markAll([[0, 0], [3, 0]]);
  const result = addCorner(corners, { x: 3.05, z: 0 });
  assert.equal(result.added, false);
  assert.equal(result.corners, corners);
  assert.equal(addCorner(corners, { x: 0.02, z: 0 }).added, false);
  assert.equal(addCorner(corners, { x: 3, z: 2 }).added, true);
});

test('undo removes only the last corner', () => {
  assert.deepEqual(undoLastCorner(markAll([[0, 0], [3, 0]])), markAll([[0, 0]]));
  assert.deepEqual(undoLastCorner([]), []);
});

test('closing puts the first corner at the origin and the first wall on +X', () => {
  const result = closeFloorplan(markAll([[2, 1], [2, 5], [-1, 5], [-1, 1]]), RECORDED_AT);
  assert.equal(result.valid, true);
  if (!result.valid) return;
  const [first, second, third] = result.environment.perimeter;
  near(first.x, 0); near(first.z, 0);
  near(second.x, 4); near(second.z, 0);
  near(Math.hypot(third.x - second.x, third.z - second.z), 3);
  assert.equal(result.environment.measurement.source, 'webxr');
  assert.equal(result.environment.confirmedAt, null);
});

test('closing never changes the measured wall lengths', () => {
  const corners = markAll([[0.3, -1.2], [4.1, 0.7], [3.2, 3.9], [-0.8, 2.2]]);
  const result = closeFloorplan(corners, RECORDED_AT);
  assert.equal(result.valid, true);
  if (!result.valid) return;
  const perimeter = result.environment.perimeter;
  wallLengthsMeters(corners).forEach((length, index) => {
    near(Math.hypot(perimeter[index + 1].x - perimeter[index].x, perimeter[index + 1].z - perimeter[index].z), length);
  });
});

test('the session transform stays out of the environment that gets saved', () => {
  const result = closeFloorplan(markAll([[2, 1], [2, 5], [-1, 5]]), RECORDED_AT);
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.ok(result.sessionToProject);
  assert.doesNotMatch(JSON.stringify(result.environment), /origin|rotationRadians|sessionToProject/);
});

test('a crossed plan is not closed', () => {
  const result = closeFloorplan(markAll([[0, 0], [2, 2], [2, 0], [0, 2]]), RECORDED_AT);
  assert.equal(result.valid, false);
  assert.equal(result.environment, null);
});

test('fewer than three corners is not closed', () => {
  assert.equal(closeFloorplan(markAll([[0, 0], [2, 0]]), RECORDED_AT).valid, false);
});

test('the project root pose lands every corner back on its marked point', () => {
  const corners = markAll([[2, 1], [2, 5], [-1, 5], [-1, 1]]);
  const result = closeFloorplan(corners, RECORDED_AT);
  assert.equal(result.valid, true);
  if (!result.valid) return;
  const pose = projectRootPose(result.sessionToProject, 0.25);
  const root = new THREE.Group();
  root.position.set(pose.position.x, pose.position.y, pose.position.z);
  root.rotation.y = pose.rotationY;
  root.updateMatrixWorld(true);
  result.environment.perimeter.forEach((vertex, index) => {
    const onFloor = new THREE.Vector3(vertex.x, 0, vertex.z).applyMatrix4(root.matrixWorld);
    near(onFloor.x, corners[index].x);
    near(onFloor.y, 0.25);
    near(onFloor.z, corners[index].z);
  });
});

test('session points convert into the same frame as the perimeter', () => {
  const corners = markAll([[2, 1], [2, 5], [-1, 5]]);
  const result = closeFloorplan(corners, RECORDED_AT);
  assert.equal(result.valid, true);
  if (!result.valid) return;
  const point = sessionPointToProject({ x: 2, z: 5 }, result.sessionToProject);
  near(point.x, result.environment.perimeter[1].x);
  near(point.z, result.environment.perimeter[1].z);
});

test('meters use the Brazilian decimal comma', () => {
  assert.equal(formatMeters(3.416), '3,42 m');
});
