import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceMeters, horizontalHitPoint } from './xr-check-logic.ts';

function mockPose(position: { x: number; y: number; z: number }, orientation: { x: number; y: number; z: number; w: number }) {
  return { transform: { position, orientation } };
}

test('accepts a finite horizontal hit pose', () => {
  assert.deepEqual(horizontalHitPoint(mockPose({ x: 1, y: 0, z: 2 }, { x: 0, y: 0, z: 0, w: 1 })), { x: 1, y: 0, z: 2 });
});

test('rejects a vertical plane and missing pose instead of exposing stale hit data', () => {
  const verticalPlane = mockPose({ x: 1, y: 0, z: 2 }, { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 });
  assert.equal(horizontalHitPoint(verticalPlane), null);
  assert.equal(horizontalHitPoint(undefined), null);
});

test('rejects non-finite position and invalid quaternion data', () => {
  assert.equal(horizontalHitPoint(mockPose({ x: Number.NaN, y: 0, z: 2 }, { x: 0, y: 0, z: 0, w: 1 })), null);
  assert.equal(horizontalHitPoint(mockPose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 0 })), null);
});

test('computes a 3-4-12 meter separation in session coordinates', () => {
  assert.equal(distanceMeters({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 }), 13);
});
