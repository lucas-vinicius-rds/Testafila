import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EPSILON,
  assertFiniteNumber,
  assertFinitePointXZ,
  computeAABB,
  crossProduct2D,
  crossProductPoints,
  distance,
  distanceSq,
  dotProduct,
  isFiniteNumber,
  isFinitePointXZ,
  normalize,
  pointsEqual,
  polylineLength,
  snapToGrid,
  vectorAdd,
  vectorLength,
  vectorLengthSq,
  vectorScale,
  vectorSub,
} from '../domain/math2d.ts';

describe('math2d - Finiteness & Assertions', () => {
  it('isFiniteNumber validates finite numbers within bounds', () => {
    assert.equal(isFiniteNumber(42), true);
    assert.equal(isFiniteNumber(0), true);
    assert.equal(isFiniteNumber(-3.14), true);
    assert.equal(isFiniteNumber(NaN), false);
    assert.equal(isFiniteNumber(Infinity), false);
    assert.equal(isFiniteNumber(-Infinity), false);
    assert.equal(isFiniteNumber('42'), false);
    assert.equal(isFiniteNumber(null), false);
    assert.equal(isFiniteNumber(undefined), false);

    assert.equal(isFiniteNumber(5, 0, 10), true);
    assert.equal(isFiniteNumber(-1, 0, 10), false);
    assert.equal(isFiniteNumber(11, 0, 10), false);
  });

  it('assertFiniteNumber throws on invalid numbers', () => {
    assert.doesNotThrow(() => assertFiniteNumber(10, 'test', 0, 20));
    assert.throws(() => assertFiniteNumber(NaN, 'test'), TypeError);
    assert.throws(() => assertFiniteNumber(Infinity, 'test'), TypeError);
    assert.throws(() => assertFiniteNumber(25, 'test', 0, 20), RangeError);
  });

  it('isFinitePointXZ and assertFinitePointXZ validate point objects', () => {
    assert.equal(isFinitePointXZ({ x: 1.5, z: -2.5 }), true);
    assert.equal(isFinitePointXZ({ x: 0, z: 0 }), true);
    assert.equal(isFinitePointXZ({ x: NaN, z: 1 }), false);
    assert.equal(isFinitePointXZ({ x: 1, z: Infinity }), false);
    assert.equal(isFinitePointXZ(null), false);
    assert.equal(isFinitePointXZ({}), false);

    assert.doesNotThrow(() => assertFinitePointXZ({ x: 1, z: 2 }));
    assert.throws(() => assertFinitePointXZ({ x: NaN, z: 2 }), TypeError);
  });
});

describe('math2d - Vector Operations', () => {
  it('vectorSub, vectorAdd, vectorScale', () => {
    const a = { x: 3, z: 7 };
    const b = { x: 1, z: 2 };
    assert.deepEqual(vectorSub(a, b), { x: 2, z: 5 });
    assert.deepEqual(vectorAdd(a, b), { x: 4, z: 9 });
    assert.deepEqual(vectorScale(a, 2), { x: 6, z: 14 });
  });

  it('vectorLength and vectorLengthSq', () => {
    const v = { x: 3, z: 4 };
    assert.equal(vectorLength(v), 5);
    assert.equal(vectorLengthSq(v), 25);
  });

  it('distance and distanceSq', () => {
    const a = { x: 0, z: 0 };
    const b = { x: 3, z: 4 };
    assert.equal(distance(a, b), 5);
    assert.equal(distanceSq(a, b), 25);
  });

  it('pointsEqual respects epsilon', () => {
    assert.equal(pointsEqual({ x: 1, z: 1 }, { x: 1, z: 1 }), true);
    assert.equal(pointsEqual({ x: 1, z: 1 }, { x: 1 + EPSILON / 2, z: 1 }), true);
    assert.equal(pointsEqual({ x: 1, z: 1 }, { x: 1 + 0.001, z: 1 }), false);
  });

  it('normalize returns unit vector or (0,0) if degenerate', () => {
    const v = { x: 0, z: 10 };
    const n = normalize(v);
    assert.equal(n.x, 0);
    assert.equal(n.z, 1);

    const zero = normalize({ x: 0, z: 0 });
    assert.equal(zero.x, 0);
    assert.equal(zero.z, 0);
  });

  it('dotProduct and crossProduct2D', () => {
    const a = { x: 1, z: 0 };
    const b = { x: 0, z: 1 };
    assert.equal(dotProduct(a, b), 0);
    assert.equal(crossProduct2D(a, b), 1); // +X to +Z
    assert.equal(crossProduct2D(b, a), -1);

    const parallel = { x: 2, z: 0 };
    assert.equal(crossProduct2D(a, parallel), 0);
  });

  it('crossProductPoints determines turn orientation', () => {
    const o = { x: 0, z: 0 };
    const a = { x: 1, z: 0 };
    const b = { x: 1, z: 1 };
    assert.ok(crossProductPoints(o, a, b) > 0); // CCW turn
    assert.ok(crossProductPoints(o, b, a) < 0); // CW turn
    assert.equal(crossProductPoints(o, a, { x: 2, z: 0 }), 0); // collinear
  });
});

describe('math2d - Polyline & Bounding Box & Snapping', () => {
  it('polylineLength calculates cumulative distance', () => {
    assert.equal(polylineLength([]), 0);
    assert.equal(polylineLength([{ x: 1, z: 1 }]), 0);
    const line = [
      { x: 0, z: 0 },
      { x: 3, z: 0 },
      { x: 3, z: 4 },
    ];
    assert.equal(polylineLength(line), 7);
  });

  it('computeAABB computes accurate bounds', () => {
    const pts = [
      { x: -2, z: 5 },
      { x: 4, z: -1 },
      { x: 1, z: 8 },
    ];
    const box = computeAABB(pts);
    assert.equal(box.minX, -2);
    assert.equal(box.maxX, 4);
    assert.equal(box.minZ, -1);
    assert.equal(box.maxZ, 8);
    assert.equal(box.width, 6);
    assert.equal(box.depth, 9);
  });

  it('snapToGrid snaps coordinates to grid intervals', () => {
    const p1 = { x: 1.23, z: 4.79 };
    const snapped = snapToGrid(p1, 0.5);
    assert.equal(snapped.x, 1.0);
    assert.equal(snapped.z, 5.0);

    const p2 = { x: -0.01, z: 0.01 };
    const snapped2 = snapToGrid(p2, 0.1);
    assert.equal(snapped2.x, 0);
    assert.equal(snapped2.z, 0);

    // Grid with custom origin
    const p3 = { x: 1.15, z: 2.15 };
    const snapped3 = snapToGrid(p3, 1.0, { x: 0.5, z: 0.5 });
    assert.equal(snapped3.x, 1.5);
    assert.equal(snapped3.z, 2.5);
  });
});
