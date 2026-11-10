import assert from 'node:assert/strict';
import test from 'node:test';
import { createHitStabilizer, rayFloorPoint, DEFAULT_HIT_STABILIZER } from './hit-stabilizer.ts';

const FRAME_MS = 1000 / 60;

/** Deterministic noise in [-amplitude, amplitude]. */
function noise(seed: number, amplitude: number): number {
  const v = Math.sin(seed * 12.9898) * 43758.5453;
  return ((v - Math.floor(v)) * 2 - 1) * amplitude;
}

function feed(stabilizer: ReturnType<typeof createHitStabilizer>, frames: number, at: (i: number) => { x: number; y: number; z: number } | null, start = 0) {
  let last = stabilizer.update(null, null, start);
  for (let i = 0; i < frames; i += 1) last = stabilizer.update(at(i), null, start + i * FRAME_MS);
  return last;
}

test('is not stable before the floor is learned', () => {
  const s = createHitStabilizer();
  const r = s.update({ x: 1, y: 0, z: 2 }, null, 0);
  assert.equal(r.stable, false);
  assert.equal(r.floorY, null);
  assert.deepEqual(r.point, { x: 1, y: 0, z: 2 });
});

test('noisy hits on a held aim become stable near the true point', () => {
  const s = createHitStabilizer();
  const r = feed(s, 60, (i) => ({ x: 1 + noise(i, 0.015), y: noise(i + 99, 0.01), z: 2 + noise(i + 7, 0.015) }));
  assert.equal(r.stable, true);
  assert.ok(r.floorY !== null && Math.abs(r.floorY) < 0.01);
  assert.ok(Math.hypot(r.point!.x - 1, r.point!.z - 2) < 0.01, JSON.stringify(r.point));
});

test('needs the hold time before reporting stable', () => {
  const s = createHitStabilizer();
  feed(s, 20, () => ({ x: 0, y: 0, z: 0 }));
  // Big move restarts the window.
  const r = feed(s, 5, () => ({ x: 2, y: 0, z: 0 }), 1000);
  assert.equal(r.stable, false);
  assert.ok(r.progress < 1);
});

test('hits off the locked floor are rejected in favor of the camera ray', () => {
  const s = createHitStabilizer();
  feed(s, 20, () => ({ x: 0, y: 0, z: 0 }));
  const ray = { origin: { x: 0, y: 1.5, z: 0 }, direction: { x: 0, y: -1, z: -1 } };
  const r = s.update({ x: 0, y: 0.75, z: -0.8 }, ray, 1000); // a table top
  assert.equal(r.point!.y, r.floorY);
  assert.ok(Math.abs(r.point!.z + 1.5) < 1e-9);
});

test('the camera ray covers frames where the hit-test drops out', () => {
  const s = createHitStabilizer();
  feed(s, 20, () => ({ x: 0, y: 0, z: 0 }));
  const r = s.update(null, { origin: { x: 0, y: 1.5, z: 0 }, direction: { x: 1, y: -1, z: 0 } }, 1000);
  assert.ok(r.point && Math.abs(r.point.x - 1.5) < 1e-9);
});

test('nothing usable interrupts the window but keeps the floor', () => {
  const s = createHitStabilizer();
  feed(s, 40, () => ({ x: 0, y: 0, z: 0 }));
  const r = s.update(null, null, 1000);
  assert.equal(r.point, null);
  assert.equal(r.stable, false);
  assert.equal(r.floorY, 0);
});

test('reset forgets the floor', () => {
  const s = createHitStabilizer();
  feed(s, 20, () => ({ x: 0, y: 0, z: 0 }));
  s.reset();
  assert.equal(s.update({ x: 0, y: 0, z: 0 }, null, 0).floorY, null);
});

test('ray-floor intersection ignores rays looking up or too far', () => {
  assert.equal(rayFloorPoint({ origin: { x: 0, y: 1.5, z: 0 }, direction: { x: 0, y: 0.1, z: -1 } }, 0, 8), null);
  assert.equal(rayFloorPoint({ origin: { x: 0, y: 1.5, z: 0 }, direction: { x: 0, y: -0.01, z: -1 } }, 0, DEFAULT_HIT_STABILIZER.maxRayDistanceMeters), null);
});
