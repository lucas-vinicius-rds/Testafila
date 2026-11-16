import assert from 'node:assert/strict';
import test from 'node:test';
import { createDriftFilter, DEFAULT_DRIFT_FILTER, fitDrift, NO_DRIFT, toRaw, toStable, type Drift } from './anchor-drift.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const p = (x: number, z: number, y = 0) => ({ x, y, z });

test('no anchors means no drift', () => {
  assert.equal(fitDrift([]), NO_DRIFT);
});

test('one anchor corrects translation and height only', () => {
  const drift = fitDrift([{ base: p(1, 2), current: p(1.2, 1.9, 0.03) }]);
  near(drift.dx, 0.2); near(drift.dz, -0.1); near(drift.dy, 0.03);
  assert.equal(drift.rotationRadians, 0);
});

test('spread anchors recover a rotation and a translation exactly', () => {
  const truth: Drift = { dx: 0.3, dy: -0.02, dz: -0.15, rotationRadians: 0.05 };
  const bases = [p(0, 0), p(3, 0), p(3, 4), p(-1, 2.5)];
  const drift = fitDrift(bases.map((base) => ({ base, current: toRaw(truth, base) })));
  near(drift.dx, truth.dx); near(drift.dz, truth.dz); near(drift.dy, truth.dy); near(drift.rotationRadians, truth.rotationRadians);
});

test('anchors bunched together do not produce a rotation', () => {
  const truth: Drift = { dx: 0, dy: 0, dz: 0, rotationRadians: 0.3 };
  const bases = [p(5, 5), p(5.2, 5.1)];
  const drift = fitDrift(bases.map((base) => ({ base, current: toRaw(truth, base) })));
  assert.equal(drift.rotationRadians, 0);
});

test('two anchors, however far apart, do not produce a rotation', () => {
  const truth: Drift = { dx: 0, dy: 0, dz: 0, rotationRadians: 0.05 };
  const bases = [p(0, 0), p(6, 0)];
  const drift = fitDrift(bases.map((base) => ({ base, current: toRaw(truth, base) })));
  assert.equal(drift.rotationRadians, 0);
});

test('three anchors less than two metres across do not produce a rotation', () => {
  const truth: Drift = { dx: 0, dy: 0, dz: 0, rotationRadians: 0.05 };
  const bases = [p(0, 0), p(0.8, 0), p(0.4, 0.7)];
  const drift = fitDrift(bases.map((base) => ({ base, current: toRaw(truth, base) })));
  assert.equal(drift.rotationRadians, 0);
});

const at = (dx: number, rotationRadians = 0): Drift => ({ dx, dy: 0, dz: 0, rotationRadians });

test('the filter ignores corrections within the anchor noise', () => {
  const f = createDriftFilter();
  for (let i = 0; i < 100; i += 1) assert.equal(f.update(at(i % 2 ? 0.015 : -0.015, 0.005)), NO_DRIFT);
});

test('the filter eases into a real correction instead of jumping', () => {
  const f = createDriftFilter();
  const first = f.update(at(0.2));
  near(first.dx, 0.2 * DEFAULT_DRIFT_FILTER.smoothing);
  let last = first;
  for (let i = 0; i < 60; i += 1) last = f.update(at(0.2));
  assert.ok(Math.abs(last.dx - 0.2) <= DEFAULT_DRIFT_FILTER.deadbandMeters, String(last.dx));
});

test('the filter waits out a sudden jump and follows it only if it persists', () => {
  const f = createDriftFilter();
  // A one-off bad reading of 1 m.
  assert.equal(f.update(at(1)), NO_DRIFT);
  assert.equal(f.update(at(0)), NO_DRIFT);
  // A relocalization: the same 1 m, frame after frame.
  let last = NO_DRIFT;
  for (let i = 0; i < DEFAULT_DRIFT_FILTER.jumpFrames - 1; i += 1) last = f.update(at(1));
  assert.equal(last, NO_DRIFT);
  for (let i = 0; i < 80; i += 1) last = f.update(at(1));
  assert.ok(Math.abs(last.dx - 1) <= DEFAULT_DRIFT_FILTER.deadbandMeters, String(last.dx));
});

test('reset returns the filter to no drift', () => {
  const f = createDriftFilter();
  f.update(at(0.2));
  f.reset();
  assert.equal(f.update(at(0.01)), NO_DRIFT);
});

test('toStable undoes toRaw, and distances are preserved (no scale)', () => {
  const drift: Drift = { dx: 1.5, dy: 0.1, dz: -2, rotationRadians: -0.7 };
  const a = p(2, -3, 0.4);
  const b = p(-1, 6, 0.4);
  const back = toStable(drift, toRaw(drift, a));
  near(back.x, a.x); near(back.y, a.y); near(back.z, a.z);
  const ra = toRaw(drift, a); const rb = toRaw(drift, b);
  near(Math.hypot(ra.x - rb.x, ra.z - rb.z), Math.hypot(a.x - b.x, a.z - b.z));
});
