import assert from 'node:assert/strict';
import test from 'node:test';
import { nearestSurface } from './hit-classify.ts';

const FLOOR = { x: 0, y: 0, z: 0, w: 1 };
const WALL = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
const pose = (x: number, y: number, z: number, orientation = FLOOR) => ({ transform: { position: { x, y, z }, orientation } });

test('no results, or only unusable poses, is nothing', () => {
  assert.deepEqual(nearestSurface([]), { floorHit: null, floorIndex: -1, obstacle: null });
  assert.deepEqual(nearestSurface([null, pose(Number.NaN, 0, 0)]), { floorHit: null, floorIndex: -1, obstacle: null });
});

test('a nearest horizontal surface is the floor hit', () => {
  assert.deepEqual(nearestSurface([pose(1, 0, 2), pose(1, 0, 5, WALL)]), { floorHit: { x: 1, y: 0, z: 2 }, floorIndex: 0, obstacle: null });
});

test('a wall in front hides the floor behind it', () => {
  const r = nearestSurface([pose(0, 1, -1, WALL), pose(0, 0, -3)]);
  assert.equal(r.floorHit, null);
  assert.deepEqual(r.obstacle, { x: 0, y: 1, z: -1 });
});

test('a tilted feature point lying on a horizontal hit is the same spot', () => {
  const r = nearestSurface([pose(1, 0.02, 2, WALL), pose(1.05, 0, 2.05)]);
  assert.deepEqual(r.floorHit, { x: 1.05, y: 0, z: 2.05 });
  assert.equal(r.floorIndex, 1);
  assert.equal(r.obstacle, null);
});

test('unusable poses before the nearest surface are skipped', () => {
  assert.equal(nearestSurface([null, pose(1, 0, 2)]).floorIndex, 1);
});
