import assert from 'node:assert/strict';
import test from 'node:test';
import { createHitStabilizer, rayFloorPoint, DEFAULT_HIT_STABILIZER, type StabilizedHit } from './hit-stabilizer.ts';

const FRAME_MS = 1000 / 60;
type P = { x: number; y: number; z: number };
type Stabilizer = ReturnType<typeof createHitStabilizer>;

/** Deterministic noise in [-amplitude, amplitude]. */
function noise(seed: number, amplitude: number): number {
  const v = Math.sin(seed * 12.9898) * 43758.5453;
  return ((v - Math.floor(v)) * 2 - 1) * amplitude;
}

/** A camera 1.5 m up, looking down and ahead. */
const RAY = { origin: { x: 0, y: 1.5, z: 0 }, direction: { x: 0, y: -1, z: -1 } };

function feed(s: Stabilizer, frames: number, at: (i: number) => P | null, start = 0, ray: typeof RAY | null = RAY, hint: number | null = null): StabilizedHit {
  let last = s.update(at(0), ray, start, hint);
  for (let i = 1; i < frames; i += 1) last = s.update(at(i), ray, start + i * FRAME_MS, hint);
  return last;
}

/** Sweeps the aim 1 m sideways over `frames` at height `y`: what the user is asked to do. */
const sweep = (y: number, frames: number) => (i: number): P => ({ x: i / frames, y, z: -1.5 });

/** Learns a floor at `y` with a 1.5 s sweep; returns the time right after it. */
function learn(s: Stabilizer, y = 0, start = 0): number {
  const r = feed(s, 90, sweep(y, 90), start);
  assert.ok(r.floorY !== null && Math.abs(r.floorY - y) < 1e-9, `floor not learned: ${r.floorY}`);
  return start + 90 * FRAME_MS;
}

test('is not stable before the floor is learned', () => {
  const s = createHitStabilizer();
  const r = s.update({ x: 1, y: 0, z: 2 }, RAY, 0);
  assert.equal(r.stable, false);
  assert.equal(r.floorY, null);
  assert.deepEqual(r.point, { x: 1, y: 0, z: 2 });
});

test('a held aim does not teach the floor: the hits must be spread across it', () => {
  const s = createHitStabilizer();
  const r = feed(s, 240, () => ({ x: 1, y: 0, z: 2 }));
  assert.equal(r.floorY, null);
  assert.equal(r.stable, false);
});

test('a glimpse of a surface is too short to become the floor', () => {
  const s = createHitStabilizer();
  // Half a second sweeping a cabinet top, well spread.
  const r = feed(s, 30, sweep(0.9, 30));
  assert.equal(r.floorY, null);
});

test('a surface too close below the camera is not the floor', () => {
  const s = createHitStabilizer();
  // A shelf 30 cm below the phone, swept for long enough.
  assert.equal(feed(s, 120, sweep(1.2, 120)).floorY, null);
  // Without a camera pose the height cannot be checked and is not required.
  const blind = createHitStabilizer();
  assert.equal(feed(blind, 120, sweep(1.2, 120), 0, null).floorY, 1.2);
});

test('a sweep of consistent hits teaches the floor, and a held aim then becomes stable near the true point', () => {
  const s = createHitStabilizer();
  const t = learn(s);
  const r = feed(s, 60, (i) => ({ x: 1 + noise(i, 0.015), y: noise(i + 99, 0.01), z: 2 + noise(i + 7, 0.015) }), t);
  assert.equal(r.stable, true);
  assert.equal(r.source, 'hit');
  assert.ok(r.floorY !== null && Math.abs(r.floorY) < 0.01);
  assert.ok(Math.hypot(r.point!.x - 1, r.point!.z - 2) < 0.01, JSON.stringify(r.point));
});

test('needs the hold time before reporting stable', () => {
  const s = createHitStabilizer();
  const t = learn(s);
  const r = feed(s, 5, () => ({ x: 4, y: 0, z: 0 }), t);
  assert.equal(r.stable, false);
  assert.ok(r.progress < 1);
});

test('a table top over the locked floor blocks the aim instead of showing the floor behind it', () => {
  const s = createHitStabilizer();
  const t = learn(s);
  const r = s.update({ x: 0, y: 0.75, z: -0.8 }, RAY, t);
  assert.equal(r.point, null);
  assert.equal(r.source, 'blocked');
  assert.equal(r.floorY, 0);
});

test('a wall or a cabinet front blocks the aim', () => {
  const s = createHitStabilizer();
  const t = learn(s);
  const r = s.update(null, RAY, t, null, { x: 0, y: 1, z: -0.5 });
  assert.equal(r.point, null);
  assert.equal(r.source, 'blocked');
  // Before the floor is known, too.
  assert.equal(createHitStabilizer().update(null, RAY, 0, null, { x: 0, y: 1, z: -0.5 }).source, 'blocked');
});

test('a tilted hit at floor height is a feature point on the floor, not an obstacle', () => {
  const s = createHitStabilizer();
  const t = learn(s);
  const r = s.update(null, RAY, t, null, { x: 0, y: 0.03, z: -1.5 });
  assert.equal(r.source, 'ray');
  assert.ok(r.point && Math.abs(r.point.z + 1.5) < 1e-9);
});

test('the camera ray covers a short hit-test dropout, and only a short one', () => {
  const s = createHitStabilizer();
  const t = learn(s);
  const ray = { origin: { x: 0, y: 1.5, z: 0 }, direction: { x: 1, y: -1, z: 0 } };
  const soon = s.update(null, ray, t + 500);
  assert.equal(soon.source, 'ray');
  assert.ok(soon.point && Math.abs(soon.point.x - 1.5) < 1e-9);
  const late = s.update(null, ray, t + 500 + DEFAULT_HIT_STABILIZER.rayGraceMs + 600);
  assert.equal(late.point, null);
  assert.equal(late.source, 'none');
});

test('nothing usable interrupts the window but keeps the floor', () => {
  const s = createHitStabilizer();
  const t = learn(s);
  const r = s.update(null, null, t);
  assert.equal(r.point, null);
  assert.equal(r.stable, false);
  assert.equal(r.floorY, 0);
});

test('reset forgets the floor, so it can be learned again at another height', () => {
  const s = createHitStabilizer();
  const t = learn(s, 0.4);
  s.reset();
  assert.equal(s.update({ x: 0, y: 0, z: 0 }, RAY, t).floorY, null);
  learn(s, 0, t + FRAME_MS);
});

test('ray-floor intersection ignores rays looking up or too far', () => {
  assert.equal(rayFloorPoint({ origin: { x: 0, y: 1.5, z: 0 }, direction: { x: 0, y: 0.1, z: -1 } }, 0, 8), null);
  assert.equal(rayFloorPoint({ origin: { x: 0, y: 1.5, z: 0 }, direction: { x: 0, y: -0.01, z: -1 } }, 0, DEFAULT_HIT_STABILIZER.maxRayDistanceMeters), null);
});

test('the floor is the lowest surface: a floor locked on a table moves down once the real floor is swept', () => {
  const s = createHitStabilizer();
  const t = learn(s, 0.75);
  // First real-floor frames: shown, but not markable and the table height is still in force.
  const first = feed(s, 20, sweep(0, 90), t);
  assert.equal(first.floorY, 0.75);
  assert.equal(first.relearning, true);
  assert.equal(first.stable, false);
  assert.equal(first.point!.y, 0);
  const r = feed(s, 90, sweep(0, 90), t + 20 * FRAME_MS);
  assert.equal(r.floorY, 0);
  assert.equal(r.relearning, false);
});

test('a brief hit below the floor does not move it', () => {
  const s = createHitStabilizer();
  const t = learn(s);
  feed(s, 20, sweep(-0.5, 20), t);
  const r = s.update({ x: 0, y: 0, z: 0 }, RAY, t + 21 * FRAME_MS);
  assert.equal(r.floorY, 0);
  assert.equal(r.relearning, false);
});

test('a floor locked on a table moves down to the lowest large detected plane', () => {
  const s = createHitStabilizer();
  const t = learn(s, 0.75);
  const r = s.update({ x: 0, y: 0.75, z: 0 }, RAY, t, 0);
  assert.equal(r.floorY, 0);
  assert.equal(r.stable, false);
  // The table is now an object over the floor.
  assert.equal(r.source, 'blocked');
});

test('hits well above the detected floor plane are not learned as floor', () => {
  const s = createHitStabilizer();
  assert.equal(feed(s, 120, sweep(0.75, 120), 0, RAY, 0).floorY, null);
  const r = feed(s, 90, sweep(0.01, 90), 120 * FRAME_MS, RAY, 0);
  assert.ok(r.floorY !== null && Math.abs(r.floorY - 0.01) < 1e-9);
});
