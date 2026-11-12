import assert from 'node:assert/strict';
import test from 'node:test';
import { fitDrift, NO_DRIFT, toRaw, toStable, type Drift } from './anchor-drift.ts';

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

test('toStable undoes toRaw, and distances are preserved (no scale)', () => {
  const drift: Drift = { dx: 1.5, dy: 0.1, dz: -2, rotationRadians: -0.7 };
  const a = p(2, -3, 0.4);
  const b = p(-1, 6, 0.4);
  const back = toStable(drift, toRaw(drift, a));
  near(back.x, a.x); near(back.y, a.y); near(back.z, a.z);
  const ra = toRaw(drift, a); const rb = toRaw(drift, b);
  near(Math.hypot(ra.x - rb.x, ra.z - rb.z), Math.hypot(a.x - b.x, a.z - b.z));
});
